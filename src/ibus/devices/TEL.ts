import { IbusInterface } from '../../lib/ibus';
import { deviceStatus } from '../../lib/ibus/message';
import Logger from '../../lib/log';
import { Device, FullIbusMessage, IbusDeviceId } from '../../types';

const id = IbusDeviceId.TEL;
const namespace = IbusDeviceId[id].toLowerCase();
const log = Logger.get(namespace);
let ibusInterface: IbusInterface;

const init = (_ibusInterface: IbusInterface) => {
  log.notice('init');
  ibusInterface = _ibusInterface;
};

const term = () => {
  log.notice('term');
};

const parseMessage = (message: FullIbusMessage) => {
  switch (message.msg[0]) {
    case 0x01: {
      // Request device status
      const msg = deviceStatus(id);
      ibusInterface.sendMessage(msg);
      break;
    }
    default:
      log.warn(`Unhandled message! ${message.msg}`);
  }
};

export const TEL: Device = {
  id,
  init,
  term,
  parseMessage,
};
