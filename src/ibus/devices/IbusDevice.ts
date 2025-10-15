import { IbusInterface } from '@/lib/ibus/index.js';
import { buildMessage } from '@/ibus/message.js';
import Logger from '@/lib/log.js';
import { Device, FullIbusMessage, IbusDeviceId } from '@/types/index.js';
import { EventBus } from '@/eventbus/index.js';

type IbusDeviceConfig = { ibusInterface: IbusInterface; eventBus: EventBus };

abstract class IbusDevice implements Device {
  public readonly id: IbusDeviceId;
  protected readonly context: string;
  protected readonly log: typeof Logger;
  protected readonly ibusInterface: IbusInterface;
  protected readonly eventBus: EventBus;

  constructor(id: IbusDeviceId, config: IbusDeviceConfig) {
    this.id = id;
    this.context = IbusDeviceId[this.id].toLowerCase();
    this.log = Logger.get(this.context);
    this.ibusInterface = config.ibusInterface;
    this.eventBus = config.eventBus;
    this.log.notice('init');
  }

  abstract init(ibusInterface: IbusInterface): void;

  abstract parseMessage(message: FullIbusMessage): void;

  abstract term(): void;
}

class CDCNEW extends IbusDevice {
  constructor(config: IbusDeviceConfig) {
    super(IbusDeviceId.CDC, config);
  }

  init(ibusInterface: IbusInterface): void {
    this.log.notice('init CDCNEW');
    this.announce();
  }

  parseMessage(message: FullIbusMessage): void {
    switch (message.msg[0]) {
      default:
        this.log.warn('Unhandled message!', message.msg);
    }
  }

  term(): void {
    this.log.notice('term');
  }

  announce(): void {
    const msg = buildMessage(this.id, IbusDeviceId.LOC, [0x02, 0x01]);
    this.ibusInterface.sendMessage(msg);
    setTimeout(() => this.announce(), 3000);
  }
}

//export const CDC: Device = {
//  id,
//  init,
//  term,
//  parseMessage,
//};

export default CDCNEW;
