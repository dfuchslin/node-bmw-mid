import { buildMessage } from '../message.js';
import { AmpState } from '../amp.js';
import { FullIbusMessage, GPIO, GPIOState, IbusDeviceId } from '../../types/index.js';
import { IbusDevice, IbusDeviceConfig } from './IbusDevice.js';

const STATUS_INTERVAL_MS = 10_000;
// After ANT (the light GPIO) comes on, the amp announces "ready after reset", as in the real E38 capture.
const ANNOUNCE_DELAY_MS = 200;

// The DSP amplifier. The DSP-C sends its settings request and button presses here as `34 xx` and blanks its LCD
// when nothing answers, so the amp answers each one with its `35` status (see AmpState).
class DspDevice extends IbusDevice {
  private readonly amp = new AmpState();
  private statusTick: NodeJS.Timeout | undefined;

  constructor(config: IbusDeviceConfig) {
    super(IbusDeviceId.DSP, config);
  }

  init(): void {
    this.eventBus.on(GPIO.Light, (state: GPIOState) => this.handleLightChange(state), { context: this.context });
    this.sendStatus();
    this.statusTick = setInterval(() => this.sendStatus(), STATUS_INTERVAL_MS);
  }

  term(): void {
    this.log.notice('term');
    clearInterval(this.statusTick);
  }

  parseMessage(message: FullIbusMessage): void {
    switch (message.msg[0]) {
      case 0x34:
        this.handleCommand(message);
        break;

      case 0x32:
        // Volume from the radio (sent with the radio-on block in RAD.ts); nothing to do as there's no real amp
        this.log.debug('Volume from %s', IbusDeviceId[message.src], message.msg);
        break;

      default:
        this.log.warn('Unhandled message!', message.msg);
    }
  }

  private handleCommand(message: FullIbusMessage): void {
    if (message.msg[1] === 0x28) {
      this.log.notice('Settings requested by %s', IbusDeviceId[message.src]);
    }
    const status = this.amp.handle(message);
    if (status) {
      this.ibusInterface.sendMessage(status);
    }
  }

  private handleLightChange(state: GPIOState): void {
    if (state !== GPIOState.On) {
      return;
    }
    setTimeout(
      () => this.ibusInterface.sendMessage(buildMessage(this.id, IbusDeviceId.LOC, [0x02, 0x01])),
      ANNOUNCE_DELAY_MS,
    );
  }

  private sendStatus(): void {
    this.ibusInterface.sendMessage(buildMessage(this.id, IbusDeviceId.LOC, [0x02, 0x00]));
    // Poll the DSP-C as every working bench session did (it always answers to 0x67). Part of the confirmed set,
    // may be unnecessary.
    this.ibusInterface.sendMessage(buildMessage(IbusDeviceId.ONL, IbusDeviceId.DSPC, [0x01]));
  }
}

export default DspDevice;
