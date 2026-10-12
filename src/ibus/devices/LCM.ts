import { buildMessage } from '../message.js';
import { FullIbusMessage, IbusDeviceId } from '../../types/index.js';
import { IbusDevice, IbusDeviceConfig } from './IbusDevice.js';

// The light module's broadcasts, as in the real E38 capture. Part of the car traffic the DSP-C needs to see before
// ANT comes on (confirmed on the bench; the minimum set is not known yet).
const STATUS_INTERVAL_MS = 10_000;

class LcmDevice extends IbusDevice {
  private statusTick: NodeJS.Timeout | undefined;

  constructor(config: IbusDeviceConfig) {
    super(IbusDeviceId.LCM, config);
  }

  init(): void {
    this.sendStatus();
    this.statusTick = setInterval(() => this.sendStatus(), STATUS_INTERVAL_MS);
  }

  term(): void {
    this.log.notice('term');
    clearInterval(this.statusTick);
  }

  parseMessage(message: FullIbusMessage): void {
    switch (message.msg[0]) {
      default:
        this.log.warn('Unhandled message!', message.msg);
    }
  }

  // Lamp status (all off) and instrument backlight dimmer (58G) at max
  private sendStatus(): void {
    this.ibusInterface.sendMessage(buildMessage(this.id, IbusDeviceId.GLO, [0x5b, 0x00, 0x00, 0x00, 0x00]));
    this.ibusInterface.sendMessage(buildMessage(this.id, IbusDeviceId.GLO, [0x5c, 0xff, 0x00]));
  }
}

export default LcmDevice;
