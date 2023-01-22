import { IbusInterface } from '../../lib/ibus';
import { buildMessage, deviceStatus } from '../../lib/ibus/message';
import Logger from '../../lib/log';
import { Device, FullIbusMessage, IbusDeviceId } from '../../types';

const id = IbusDeviceId.CDC;
const namespace = IbusDeviceId[id].toLowerCase();
const log = Logger.get(namespace);
let ibusInterface: IbusInterface;

const init = (_ibusInterface: IbusInterface) => {
  log.notice('init');
  ibusInterface = _ibusInterface;
  announce();
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
      log.warn('Unhandled message!', message.msg);
  }
};

const announce = () => {
  const msg = buildMessage(id, IbusDeviceId.LOC, [0x02, 0x01]);
  ibusInterface.sendMessage(msg);
  setTimeout(() => announce(), 3000);
};

export const CDC: Device = {
  id,
  init,
  term,
  parseMessage,
};
