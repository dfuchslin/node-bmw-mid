import { FullIbusMessage, IbusMessage, LogLevel } from '../../types/index.js';

// What the app's I-Bus layer needs from a transport: either the local serial IbusInterface or an
// IbusBridgeClient talking to the ibus-bridge over TCP. 'data' carries every frame seen on the bus, including
// echoes of our own writes.
export type IbusTransport = {
  on(eventName: 'data', fn: (message: FullIbusMessage) => void, ctx?: { context: string; logLevel?: LogLevel }): void;
  startup(): void;
  shutdown(callback?: () => void): void;
  sendMessage(msg: IbusMessage): void;
};
