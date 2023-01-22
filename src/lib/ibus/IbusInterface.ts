/*
From https://github.com/osvathrobi/node-ibus
Added here to support updated 'serialport' versions
Also rudimentary conversion to typescript
*/

import Logger from 'log';
import { SerialPort } from 'serialport';
import { IbusProtocol, createBufferFromIbusMessage } from './IbusProtocol';
import { FullIbusMessage, IbusMessage } from '../../types/ibus';
import { CustomEmitter, LogLevel } from '../../types';

const namespace = 'ibus-bus';
const log = Logger.get(namespace);

export class IbusInterface extends CustomEmitter<{ data: FullIbusMessage }> {
  private devicePath: string;
  private lastActivityTime: [number, number];
  private queue: Buffer[];
  private serialPort: SerialPort | undefined;
  private parser: IbusProtocol | undefined;

  constructor(devicePath: string) {
    super(namespace, LogLevel.DEBUG);

    this.devicePath = devicePath;
    this.lastActivityTime = process.hrtime();
    this.queue = [];
  }

  startup() {
    const path = this.devicePath;
    this.serialPort = new SerialPort({
      path,
      autoOpen: false,
      baudRate: 9600,
      parity: 'even',
      stopBits: 1,
      dataBits: 8,
    });

    this.serialPort.open(function (error) {
      if (error) {
        log.error('[IbusInterface] Failed to open port [%s]', path, error);
      } else {
        log.info('[IbusInterface] Port open [%s]', path);
      }
    });

    this.serialPort.on('data', (data: any) => {
      log.debug('[IbusInterface] Data: %O', data);
      this.lastActivityTime = process.hrtime();
    });

    this.serialPort.on('error', (err: any) => {
      log.error('[IbusInterface] Error', err);
      this.shutdown(this.startup);
    });

    this.parser = new IbusProtocol();
    this.parser.on('message', (message) => {
      this.onMessage(message);
    });

    this.serialPort.pipe(this.parser);

    this.watchForEmptyBus();
  }

  private getHrDiffTime(time: [number, number]) {
    // ts = [seconds, nanoseconds]
    const ts = process.hrtime(time);
    // convert seconds to miliseconds and nanoseconds to miliseconds as well
    return ts[0] * 1000 + ts[1] / 1000000;
  }

  private watchForEmptyBus() {
    if (this.getHrDiffTime(this.lastActivityTime) >= 20) {
      this.processWriteQueue();
    }
    setTimeout(() => this.watchForEmptyBus(), 1);
    // setImmediate(() => this.watchForEmptyBus()); // setimmediate likes to use lots of cpu
  }

  private processWriteQueue() {
    // noop on empty queue
    if (this === undefined) {
      log.error('THIS IS UNDEFINED');
    }
    if (this.queue.length <= 0) {
      return;
    }

    // process 1 message
    const dataBuf = this.queue.pop();

    log.debug('[IbusInterface] Write queue length: %d', this.queue.length);

    const onSerialPortWrite = (error: Error | null | undefined) => {
      if (error) {
        log.error('[IbusInterface] Failed to write: ' + error);
      } else {
        log.debug('[IbusInterface] Wrote to Device: %O', dataBuf);

        this.serialPort?.drain((error) => {
          log.debug('Data drained');

          // this counts as an activity, so mark it
          this.lastActivityTime = process.hrtime();
        });
      }
    };
    this.serialPort?.write(dataBuf, onSerialPortWrite);
  }

  getInterface() {
    return this.serialPort;
  }

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  shutdown(callback = () => {}) {
    log.info('[IbusInterface] Shutting down Ibus device..');

    const onSerialPortClose = (error: any) => {
      if (error) {
        log.error('[IbusInterface] Error closing port', error);
        callback();
      } else {
        log.info('[IbusInterface] Port Closed [%s]', this.devicePath);
        this.parser = undefined;
        callback();
      }
    };
    this.serialPort?.close(onSerialPortClose);
  }

  private onMessage(msg: FullIbusMessage) {
    log.debug(
      '[IbusInterface] Raw Message: ',
      msg.src,
      msg.len,
      msg.dst,
      msg.msg,
      '[' + msg.msg.toString('ascii') + ']',
      msg.crc
    );

    this.emit(namespace, 'data', msg);
  }

  sendMessage(msg: IbusMessage) {
    const dataBuf = createBufferFromIbusMessage(msg);
    log.info(`[IbusInterface] Send message (queued:${this.queue.length})`, dataBuf);

    if (this.queue.length > 1000) {
      log.warning('[IbusInterface] Queue too large, dropping message..', dataBuf);
      return;
    }

    this.queue.unshift(dataBuf);
  }
}
