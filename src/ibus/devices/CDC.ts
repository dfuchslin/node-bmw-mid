import { IbusInterface } from '../../lib/ibus';
import { buildMessage } from '../message';
import Logger from '../../lib/log';
import { Device, FullIbusMessage, IbusDeviceId } from '../../types';

const id = IbusDeviceId.CDC;
const context = IbusDeviceId[id].toLowerCase();
const log = Logger.get(context);
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
