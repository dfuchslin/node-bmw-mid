import { buildMessage } from '../message.js';
import { FullIbusMessage, IbusDeviceId } from '../../types/index.js';
import { IbusDevice, IbusDeviceConfig } from './IbusDevice.js';

// The cluster's broadcasts, as in the real E38 capture. Part of the car traffic the DSP-C needs to see before ANT
// comes on, or it never starts its application (confirmed on the bench; the minimum set is not known yet).
const SPEED_INTERVAL_MS = 2_000;
const STATUS_INTERVAL_MS = 10_000;
// Language/region coding (EN-GB, metric, 24 h) from the real E38 capture, asked for by the DSP-C after it boots.
const CODING = [0x15, 0x01, 0x04, 0x80, 0x42];

class IkeDevice extends IbusDevice {
  private speedTick: NodeJS.Timeout | undefined;
  private statusTick: NodeJS.Timeout | undefined;

  constructor(config: IbusDeviceConfig) {
    super(IbusDeviceId.IKE, config);
  }

  init(): void {
    this.sendSpeed();
    this.sendStatus();
    this.speedTick = setInterval(() => this.sendSpeed(), SPEED_INTERVAL_MS);
    this.statusTick = setInterval(() => this.sendStatus(), STATUS_INTERVAL_MS);
  }

  term(): void {
    this.log.notice('term');
    clearInterval(this.speedTick);
    clearInterval(this.statusTick);
  }

  parseMessage(message: FullIbusMessage): void {
    switch (message.msg[0]) {
      case 0x14:
        this.log.notice('Coding requested by %s', IbusDeviceId[message.src]);
        this.ibusInterface.sendMessage(buildMessage(this.id, IbusDeviceId.GLO, CODING));
        break;

      default:
        this.log.warn('Unhandled message!', message.msg);
    }
  }

  // Speed 0, RPM 0
  private sendSpeed(): void {
    this.ibusInterface.sendMessage(buildMessage(this.id, IbusDeviceId.GLO, [0x18, 0x00, 0x00]));
  }

  // Ignition on (KL15) and device ready
  private sendStatus(): void {
    this.ibusInterface.sendMessage(buildMessage(this.id, IbusDeviceId.GLO, [0x11, 0x03]));
    this.ibusInterface.sendMessage(buildMessage(this.id, IbusDeviceId.GLO, [0x02, 0x00]));
  }
}

export default IkeDevice;
