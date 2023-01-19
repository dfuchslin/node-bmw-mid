import Logger from '../../lib/log';
import { Device, FullIbusMessage, IbusDeviceId } from '../../types';

const id = IbusDeviceId.MID;
const log = Logger.get(IbusDeviceId[id].toLowerCase());

const init = () => {
  log.notice('init');
};

const term = () => {
  log.notice('term');
};

const parseMessage = (message: FullIbusMessage) => {
  log.notice('parse message');
};

export const MID: Device = {
  id,
  init,
  term,
  parseMessage,
};
