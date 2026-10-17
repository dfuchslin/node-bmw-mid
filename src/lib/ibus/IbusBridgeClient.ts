import net from 'node:net';
import readline from 'node:readline';
import Logger from '../log.js';
import { CustomEmitter, FullIbusMessage, IbusMessage, LogLevel } from '../../types/index.js';
import { frameHex, parseFrame } from './frames.js';
import { createBufferFromIbusMessage } from './IbusProtocol.js';
import { IbusTransport } from './IbusTransport.js';

const context = 'ibus-bridge-client';
const log = Logger.get(context);

const RECONNECT_MIN_MS = 1000;
const RECONNECT_MAX_MS = 10000;

// One line of the ibus-bridge stream (see src/ibus-bridge.ts); `t` is the Pi-side timestamp (epoch ms).
type BridgeEvent = { t: number; type: string; hex?: string; [key: string]: unknown };

// Talks to the ibus-bridge over TCP instead of opening the serial port, so the app can run anywhere on the
// network. Keeps reconnecting until shut down; frames sent while disconnected are dropped, since the devices
// re-send their state periodically and stale frames are worthless.
export class IbusBridgeClient extends CustomEmitter<{ data: FullIbusMessage }> implements IbusTransport {
  private readonly host: string;
  private readonly port: number;
  private socket: net.Socket | undefined;
  private connected = false;
  private stopped = false;
  private reconnectDelay = RECONNECT_MIN_MS;
  private reconnectTimer: NodeJS.Timeout | undefined;

  constructor(host: string, port: number) {
    super({ context, logLevel: LogLevel.DEBUG });
    this.host = host;
    this.port = port;
  }

  startup(): void {
    this.stopped = false;
    this.connect();
  }

  shutdown(callback = () => {}): void {
    log.info('Disconnecting from ibus-bridge at %s:%d', this.host, this.port);
    this.stopped = true;
    clearTimeout(this.reconnectTimer);
    if (!this.socket || this.socket.destroyed) {
      callback();
      return;
    }
    this.socket.once('close', () => callback());
    this.socket.end();
  }

  sendMessage(msg: IbusMessage): void {
    const hex = frameHex(msg);
    if (!this.connected) {
      log.debug('Not connected to ibus-bridge, dropping [%s]', hex);
      return;
    }
    this.socket?.write(JSON.stringify({ tx: hex }) + '\n');
  }

  isConnected(): boolean {
    return this.connected;
  }

  private connect(): void {
    const socket = net.createConnection({ host: this.host, port: this.port });
    this.socket = socket;

    socket.on('connect', () => {
      log.notice('Connected to ibus-bridge at %s:%d', this.host, this.port);
      this.connected = true;
      this.reconnectDelay = RECONNECT_MIN_MS;
    });
    // 'close' always follows 'error' and handles the reconnect
    socket.on('error', (err) => log.debug('ibus-bridge connection error: %s', err.message));
    socket.on('close', () => this.onClose());
    // socket errors are handled above; readline re-emits them
    readline
      .createInterface({ input: socket })
      .on('line', (line) => this.onLine(line))
      .on('error', () => {});
  }

  private onClose(): void {
    if (this.connected) {
      log.warn('Lost connection to ibus-bridge at %s:%d', this.host, this.port);
    }
    this.connected = false;
    if (this.stopped) {
      return;
    }
    this.reconnectTimer = setTimeout(() => this.connect(), this.reconnectDelay);
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, RECONNECT_MAX_MS);
  }

  private onLine(line: string): void {
    let event: BridgeEvent;
    try {
      event = JSON.parse(line);
    } catch {
      log.warn('Unparseable line from ibus-bridge: %s', line);
      return;
    }

    switch (event.type) {
      case 'rx':
      case 'echo':
        return this.onFrame(event);
      case 'echoMissing':
        return log.warn('ibus-bridge: no echo for [%s] (stuck at %s)', event.hex, event.stage);
      case 'error':
        return log.warn('ibus-bridge error: %s', event.message);
      case 'hello':
        return log.info('ibus-bridge is serving %s', event.path);
      default:
      // raw/queued/sent/marker are diagnostics for the probe
    }
  }

  // Echoes of our own writes are emitted too, matching the serial IbusInterface.
  private onFrame(event: BridgeEvent): void {
    const { message } = parseFrame(event.hex ?? '');
    if (!message) {
      log.warn('Invalid frame from ibus-bridge: %s', event.hex);
      return;
    }
    const buffer = createBufferFromIbusMessage(message);
    this.emit(
      'data',
      { ...message, id: Math.round(event.t), len: buffer[1], crc: buffer[buffer.length - 1] },
      { context },
    );
  }
}
