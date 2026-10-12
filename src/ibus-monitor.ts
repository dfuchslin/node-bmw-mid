import readline from 'node:readline';
import { IbusInterface } from './lib/ibus/index.js';
import { createBufferFromIbusMessage } from './lib/ibus/IbusProtocol.js';
import { config } from './config.js';
import Logger from './lib/log.js';
import { FullIbusMessage, IbusMessage } from './types/index.js';

const context = 'ibus-monitor';
const log = Logger.get(context);
const ibusTransceiverPath = config.ibus.interface.path;
const ibusInterface = new IbusInterface(ibusTransceiverPath);
const keepAlive = process.argv.includes('--keep-alive');

// Periodic broadcasts a real car would emit, so modules on the bench behave as if
// the ignition is on. The whole group is sent back to back every interval.
// Enabled with --keep-alive.
const KEEP_ALIVE_INTERVAL_MS = 10000;
const KEEP_ALIVE_FRAMES = [
  // '80 05 BF 18 00 00 22', // IKE → GLO: speed/RPM
  // 'D0 07 BF 5B 00 00 00 00 33', // LCM → GLO: light status
  // '6A 04 FF 02 01 92', // DSP → LOC: announcement (ready after reset)
  // '80 04 BF 02 00 39', // IKE → GLO: device status
  // '80 04 BF 11 03 29', // IKE → GLO: ignition on
  '3F 03 EA 00 D6', // diagnostic request to DSP-C: (wake?)
  // 'D0 03 EA 01 38',             // LCM → DSP-C: poll (keeps it awake?)
  '67 03 EA 01 8F', // 0x67 (GM service addr) → DSP-C: poll (device status request)
  '67 04 EA 02 00 8B', // 0x67 (GM service addr) → DSP-C: status "ready" (presence announcement)
  '80 03 EA 01 68', // IKE -> DSPC ping ?
  // '6A 04 EA 02 00 86', // amp status
  // '6A 0D EA 35 06 07 27 08 29 4A 69 88 A7 C6 75', // amp memory frame

  '68 04 FF 02 00 91', //      radio: ready
  '68 04 FF 36 AF 0A', //      radio: audio-control broadcasts
  '68 04 FF 36 31 94', //
  '68 04 FF 36 6A CF', //
  '68 04 FF 36 C0 65', //
  '68 04 FF 36 80 25', //
  '68 04 FF 36 50 F5', //
  '68 04 FF 36 E2 47', //
  '68 04 FF 36 A0 05', //
  '68 04 6A 32 21 15', //      radio → amp: volume
  '68 04 6A 32 20 14', //
];
let keepAliveTimer: NodeJS.Timeout | undefined;

const logMessage = (message: FullIbusMessage) => {
  log.notice(
    'src:0x%s dst:0x%s msg:%O [%s]',
    message.src.toString(16),
    message.dst.toString(16),
    message.msg,
    message.msg.toString('ascii'),
  );
};

// Accepts a raw frame as space-separated hex bytes, exactly as it appears on the
// bus/in reference docs: src len dst [data...] crc — e.g. "80 04 BF 11 01 2B".
// len/crc are only used to sanity-check the typed frame; the outgoing message is
// always sent with a freshly computed length and checksum.
const parseFrame = (line: string): IbusMessage | undefined => {
  const bytes = line
    .trim()
    .split(/\s+/)
    .map((token) => parseInt(token, 16));

  if (bytes.length < 4 || bytes.some((b) => Number.isNaN(b) || b < 0 || b > 0xff)) {
    log.error('Invalid frame "%s" — expected space-separated hex bytes: src len dst [data...] crc', line);
    return undefined;
  }

  const [src, , dst, ...rest] = bytes;
  const typedCrc = rest.pop() as number;
  const message: IbusMessage = { src, dst, msg: Buffer.from(rest) };

  const expectedCrc = createBufferFromIbusMessage(message).at(-1);
  if (typedCrc !== expectedCrc) {
    log.warn(
      'Checksum mismatch in "%s" (typed 0x%s, expected 0x%s) — sending with the correct checksum anyway',
      line,
      typedCrc.toString(16),
      expectedCrc?.toString(16),
    );
  }

  return message;
};

// Canned answers to requests the DSP-C makes during startup, since it may wait for
// them before going further. A request matches on src, dst and the leading msg bytes.
const AUTO_REPLIES = [
  { src: 0xea, dst: 0x80, prefix: [0x14], reply: '80 07 BF 15 01 04 80 42 EA' }, // DSPC → IKE: coding request → IKE coding
  { src: 0xea, dst: 0x6a, prefix: [0x34, 0x28], reply: '6A 0D EA 35 06 07 27 08 29 4A 69 88 A7 C6 75' }, // DSPC → DSP: memory request → amp memory frame
].map(({ reply, ...trigger }) => ({ ...trigger, reply, message: parseFrame(reply) }));

const autoReply = (message: FullIbusMessage) => {
  const match = AUTO_REPLIES.find(
    ({ src, dst, prefix }) =>
      message.src === src && message.dst === dst && prefix.every((byte, i) => message.msg[i] === byte),
  );
  if (!match?.message) {
    return;
  }

  ibusInterface.sendMessage(match.message);
  log.notice('Auto-replied [%s]', match.reply);
};

const sendFromInput = (line: string) => {
  if (!line.trim()) {
    return;
  }

  const message = parseFrame(line);
  if (!message) {
    return;
  }

  ibusInterface.sendMessage(message);
  log.notice('Sent src:0x%s dst:0x%s msg:%O', message.src.toString(16), message.dst.toString(16), message.msg);
};

const startKeepAlive = () => {
  const messages = KEEP_ALIVE_FRAMES.map(parseFrame).filter((message) => message !== undefined);

  const sendAll = () => {
    messages.forEach((message) => ibusInterface.sendMessage(message));
    log.debug('Keep-alive sent %d frames', messages.length);
  };

  log.notice('Keep-alive: sending %d frames every %dms', messages.length, KEEP_ALIVE_INTERVAL_MS);
  sendAll();
  keepAliveTimer = setInterval(sendAll, KEEP_ALIVE_INTERVAL_MS);
};

const term = () => {
  log.notice('Shutting down ibus monitor');
  clearInterval(keepAliveTimer);
  ibusInterface.shutdown(() => process.exit());
};

process.on('SIGTERM', term);
process.on('SIGINT', term);

log.notice('Starting ibus monitor on %s', ibusTransceiverPath);
log.notice('Type a raw frame as hex bytes to send it (src len dst data... crc), e.g: 80 04 BF 11 01 2B');
ibusInterface.on('data', logMessage, { context });
ibusInterface.on('data', autoReply, { context });
readline.createInterface({ input: process.stdin }).on('line', sendFromInput);
ibusInterface.startup();

if (keepAlive) {
  startKeepAlive();
}
