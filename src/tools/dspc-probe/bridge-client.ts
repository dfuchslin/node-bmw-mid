import net from 'node:net';
import readline from 'node:readline';
import Logger from '../../lib/log.js';
import { CustomEmitter, IbusMessage, LogLevel } from '../../types/index.js';
import { frameHex, parseFrame } from '../../lib/ibus/frames.js';

const context = 'bridge-client';
const log = Logger.get(context);

// One line of the ibus-bridge stream; `t` is the Pi-side timestamp (epoch ms).
export type BridgeEvent = {
  t: number;
  type: 'hello' | 'rx' | 'raw' | 'queued' | 'sent' | 'echo' | 'echoMissing' | 'marker' | 'error';
  hex?: string;
  [key: string]: unknown;
};

// A frame seen on the bus. `echo` frames are our own writes coming back from the transceiver.
export type BusFrame = { message: IbusMessage; hex: string; echo: boolean; event: BridgeEvent };

export class BridgeClient extends CustomEmitter<{ event: BridgeEvent; frame: BusFrame }> {
  private socket: net.Socket | undefined;

  constructor() {
    super({ context, logLevel: LogLevel.DEBUG });
  }

  connect(host: string, port: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = net.createConnection({ host, port }, () => {
        log.notice('Connected to ibus-bridge at %s:%d', host, port);
        resolve();
      });
      socket.once('error', reject);
      socket.on('error', (err) => log.warn('ibus-bridge connection error: %s', err.message));
      socket.on('close', () => log.warn('ibus-bridge connection closed'));
      // socket errors are handled above; readline re-emits them
      readline
        .createInterface({ input: socket })
        .on('line', (line) => this.onLine(line))
        .on('error', () => {});
      this.socket = socket;
    });
  }

  send(message: IbusMessage): string {
    const hex = frameHex(message);
    this.socket?.write(JSON.stringify({ tx: hex }) + '\n');
    return hex;
  }

  marker(text: string): void {
    this.socket?.write(JSON.stringify({ marker: text }) + '\n');
  }

  close(): void {
    this.socket?.end();
  }

  private onLine(line: string): void {
    let event: BridgeEvent;
    try {
      event = JSON.parse(line);
    } catch {
      log.warn('Unparseable line from bridge: %s', line);
      return;
    }

    this.emit('event', event);
    if ((event.type !== 'rx' && event.type !== 'echo') || !event.hex) {
      return;
    }
    const { message } = parseFrame(event.hex);
    if (message) {
      this.emit('frame', { message, hex: event.hex, echo: event.type === 'echo', event });
    }
  }
}
