import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import readline from 'node:readline';
import { IbusInterface } from '../lib/ibus/index.js';
import Logger from '../lib/log.js';
import { FullIbusMessage } from '../types/index.js';
import { frameHex, parseFrame, toHex } from './frames.js';

// A dumb I-Bus ⇄ TCP bridge that runs on the Pi next to the transceiver. It never sends anything on its
// own: clients send frames, and every bus event is streamed back to all connected clients as
// newline-delimited JSON, timestamped here so that network jitter doesn't skew timing.
//
//   client → bridge: {"tx":"68 04 FF 36 AF 0A"}  (full frame, LEN/CHK verified)   {"marker":"text"}
//   bridge → client: {"t":…,"type":"rx"|"raw"|"queued"|"sent"|"echo"|"echoMissing"|"marker"|"error"|"hello",…}
//
// Debug by hand with: nc <pi-host> 7700

const context = 'ibus-bridge';
const log = Logger.get(context);

const IBUS_INTERFACE_PATH = process.env.IBUS_INTERFACE_PATH ?? '/dev/ttyUSB0';
const BRIDGE_PORT = Number(process.env.BRIDGE_PORT ?? 7700);
const BRIDGE_LOG_DIR = process.env.BRIDGE_LOG_DIR ?? './probe-logs';
const ECHO_TIMEOUT_MS = 100;
// A frame stuck in the write queue (bus never idle) never reaches the 'sent' stage at all.
const SEND_TIMEOUT_MS = 2000;

type PendingEcho = { hex: string; queuedAt: number; sentAt?: number; timer?: NodeJS.Timeout };

const now = () => performance.timeOrigin + performance.now();
const ibusInterface = new IbusInterface(IBUS_INTERFACE_PATH);
const clients = new Set<net.Socket>();
const pendingEchoes: PendingEcho[] = [];

fs.mkdirSync(BRIDGE_LOG_DIR, { recursive: true });
const logFile = fs.createWriteStream(
  path.join(BRIDGE_LOG_DIR, `bridge-${new Date().toISOString().replace(/[:.]/g, '-')}.jsonl`),
  { flags: 'a' },
);

const publish = (event: Record<string, unknown>) => {
  const line = JSON.stringify({ t: now(), ...event }) + '\n';
  logFile.write(line);
  clients.forEach((client) => client.write(line));
};

const onRaw = (chunk: Buffer) => publish({ type: 'raw', hex: toHex(chunk) });

const onSent = (buffer: Buffer) => {
  const hex = toHex(buffer);
  const queue = ibusInterface.getQueueLength();
  publish({ type: 'sent', hex, queue });

  const pending = pendingEchoes.find((entry) => entry.hex === hex && entry.sentAt === undefined);
  if (!pending) {
    return;
  }
  clearTimeout(pending.timer);
  pending.sentAt = now();
  pending.timer = setTimeout(() => expireEcho(pending, 'sent'), ECHO_TIMEOUT_MS);
};

const expireEcho = (pending: PendingEcho, stage: 'queued' | 'sent') => {
  pendingEchoes.splice(pendingEchoes.indexOf(pending), 1);
  const queue = ibusInterface.getQueueLength();
  log.warn('No echo for [%s] (stuck at %s, queue %d) — bus not idle or CTS blocked?', pending.hex, stage, queue);
  publish({ type: 'echoMissing', hex: pending.hex, stage, queue });
};

const onFrame = (message: FullIbusMessage) => {
  const hex = frameHex(message);
  const pendingIndex = pendingEchoes.findIndex((entry) => entry.hex === hex);
  if (pendingIndex < 0) {
    publish({ type: 'rx', hex });
    return;
  }

  const [pending] = pendingEchoes.splice(pendingIndex, 1);
  clearTimeout(pending.timer);
  const t = now();
  publish({
    type: 'echo',
    hex,
    latencyMs: pending.sentAt === undefined ? undefined : t - pending.sentAt,
    sinceQueuedMs: t - pending.queuedAt,
  });
};

const handleClientLine = (line: string) => {
  if (!line.trim()) {
    return;
  }

  let request: { tx?: unknown; marker?: unknown };
  try {
    request = JSON.parse(line);
  } catch {
    publish({ type: 'error', message: `invalid JSON: ${line}` });
    return;
  }

  if (typeof request.marker === 'string') {
    publish({ type: 'marker', text: request.marker });
    return;
  }

  if (typeof request.tx !== 'string') {
    publish({ type: 'error', message: `expected {"tx":"<frame>"} or {"marker":"<text>"}: ${line}` });
    return;
  }

  const parsed = parseFrame(request.tx);
  if (!parsed.message) {
    publish({ type: 'error', message: parsed.error });
    return;
  }

  const hex = frameHex(parsed.message);
  const pending: PendingEcho = { hex, queuedAt: now() };
  pending.timer = setTimeout(() => expireEcho(pending, 'queued'), SEND_TIMEOUT_MS);
  pendingEchoes.push(pending);
  ibusInterface.sendMessage(parsed.message);
  publish({ type: 'queued', hex, queue: ibusInterface.getQueueLength() });
};

const server = net.createServer((socket) => {
  const peer = `${socket.remoteAddress}:${socket.remotePort}`;
  log.notice('Client connected %s', peer);
  clients.add(socket);
  socket.write(JSON.stringify({ t: now(), type: 'hello', path: IBUS_INTERFACE_PATH }) + '\n');
  // A client that disappears abruptly (ECONNRESET) must not take the bridge down; 'close' cleans up.
  readline
    .createInterface({ input: socket })
    .on('line', handleClientLine)
    .on('error', () => {});
  socket.on('close', () => {
    log.notice('Client disconnected %s', peer);
    clients.delete(socket);
  });
  socket.on('error', (err) => log.warn('Client %s error: %s', peer, err.message));
});

const term = () => {
  log.notice('Shutting down ibus bridge');
  clients.forEach((client) => client.destroy());
  server.close();
  logFile.end();
  ibusInterface.shutdown(() => process.exit());
};

process.on('SIGTERM', term);
process.on('SIGINT', term);

ibusInterface.on('raw', onRaw, { context });
ibusInterface.on('sent', onSent, { context });
ibusInterface.on('data', onFrame, { context });
ibusInterface.startup();
server.listen(BRIDGE_PORT, () => log.notice('Bridging %s on tcp port %d', IBUS_INTERFACE_PATH, BRIDGE_PORT));
