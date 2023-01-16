/*
From https://github.com/osvathrobi/node-ibus
Added here to support updated 'serialport' versions
Also rudimentary conversion to a class and typescript
*/

import { SerialPort } from 'serialport';
import { EventEmitter } from 'stream';
import { IbusProtocol, createBufferFromIbusMessage } from './IbusProtocol';
import Logger from 'log';
import { FullIbusMessage, IbusMessage } from '../../types/ibus';

const namespace = 'ibus-bus';
const log = Logger.get(namespace);

export class IbusInterface extends EventEmitter {
  private devicePath: string;
  private lastActivityTime: [number, number];
  private queue: Buffer[];
  private serialPort: SerialPort | undefined;
  private parser: IbusProtocol | undefined;

  constructor(devicePath: string) {
    super();

    this.devicePath = devicePath;
    this.lastActivityTime = process.hrtime();
    this.queue = [];
  }

  startup() {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const instance = this;
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

    const onSerialPortData = (data: any) => {
      log.debug('[IbusInterface] Data: %O', data);
      instance.lastActivityTime = process.hrtime();
    };
    this.serialPort.on('data', onSerialPortData);

    const onSerialPortError = (err: any) => {
      log.error('[IbusInterface] Error', err);
      instance.shutdown(this.startup);
    };
    this.serialPort.on('error', onSerialPortError);

    // this.serialPort.on('data', function (data) {
    //   log.debug('[IbusInterface] Data on port: ', data);
    //   instance.lastActivityTime = process.hrtime();
    // });

    // this.serialPort.on('error', function (err) {
    //   log.error('[IbusInterface] Error', err);
    //   instance.shutdown(instance.startup);
    // });

    this.parser = new IbusProtocol();
    this.parser.on('message', this.onMessage);

    this.serialPort.pipe(this.parser);

    this.watchForEmptyBus(() => {
      this.processWriteQueue(() => {
        //});
      });
    });
  }

  getHrDiffTime(time: [number, number]) {
    // ts = [seconds, nanoseconds]
    const ts = process.hrtime(time);
    // convert seconds to miliseconds and nanoseconds to miliseconds as well
    return ts[0] * 1000 + ts[1] / 1000000;
  }

  private watchForEmptyBus(workerFn: any) {
    if (this.getHrDiffTime(this.lastActivityTime) >= 20) {
      workerFn(() => {
        // const watchForEmptyBus = () => {
        //   this.watchForEmptyBus(workerFn);
        // };
        // operation is ready, resume looking for an empty bus
        // setImmediate(this.watchForEmptyBus, workerFn);
        setImmediate(() => {
          this.watchForEmptyBus(workerFn);
        });
      });
    } else {
      // keep looking for an empty Bus
      // setImmediate(this.watchForEmptyBus, workerFn);
      setImmediate(() => this.watchForEmptyBus(workerFn));
    }
  }

  private processWriteQueue(ready: any) {
    // noop on empty queue
    if (this === undefined) {
      log.error('THIS IS UNDEFINED');
    }
    if (this.queue.length <= 0) {
      ready();
      return;
    }

    // process 1 message
    const dataBuf = this.queue.pop();

    log.debug('[IbusInterface] Write queue length: %d', this.queue.length);

    const onSerialPortWrite = (error: Error | null | undefined) => {
      if (error) {
        log.error('[IbusInterface] Failed to write: ' + error);
      } else {
        log.info('[IbusInterface] Wrote to Device: %O', dataBuf);

        this.serialPort?.drain((error) => {
          log.debug('Data drained');

          // this counts as an activity, so mark it
          this.lastActivityTime = process.hrtime();

          ready();
        });
      }
    };
    this.serialPort?.write(dataBuf, onSerialPortWrite);

    // this.serialPort?.write(dataBuf, function (error, resp) {
    //   if (error) {
    //     log.error('[IbusInterface] Failed to write: ' + error);
    //   } else {
    //     log.info('[IbusInterface] ', clc.white('Wrote to Device: '), dataBuf, resp);

    //     serialPort.drain(function (error) {
    //       log.debug(clc.white('Data drained'));

    //       // this counts as an activity, so mark it
    //       lastActivityTime = process.hrtime();

    //       ready();
    //     });
    //   }
    // });
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

    // this.serialPort.close(function (error) {
    //   if (error) {
    //     log.error('[IbusInterface] Error closing port: ', error);
    //     callback();
    //   } else {
    //     log.info('[IbusInterface] Port Closed [' + device + ']');
    //     parser = null;
    //     callback();
    //   }
    // });
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

    this.emit('data', msg);
  }

  sendMessage(msg: IbusMessage) {
    const dataBuf = createBufferFromIbusMessage(msg);
    log.debug('[IbusInterface] Send message: ', dataBuf);

    if (this.queue.length > 1000) {
      log.warning('[IbusInterface] Queue too large, dropping message..', dataBuf);
      return;
    }

    this.queue.unshift(dataBuf);
  }
}
