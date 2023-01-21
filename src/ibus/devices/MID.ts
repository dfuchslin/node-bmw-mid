import { IbusInterface } from '../../lib/ibus';
import { deviceStatus } from '../../lib/ibus/message';
import Logger from '../../lib/log';
import { Device, FullIbusMessage, IbusDeviceId } from '../../types';

const id = IbusDeviceId.MID;
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
      ibusInterface.sendMessage(deviceStatus(id));
      break;
    }
    default:
      log.warn(`Unhandled message! ${message.msg}`);
  }
};

export const MID: Device = {
  id,
  init,
  term,
  parseMessage,
};

// ✖ ibus-router unhandled src:MID dst:LOC msg:  �
