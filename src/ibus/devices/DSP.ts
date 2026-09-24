import { buildMessage } from '../message.js';
import { IbusInterface } from '../../lib/ibus/index.js';
import Logger from '../../lib/log.js';
import { Device, FullIbusMessage, IbusDeviceId } from '../../types/index.js';

const id = IbusDeviceId.DSP;
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

const announce = () => {
  const msg = buildMessage(id, IbusDeviceId.GLO, [0x02, 0x01]);
  ibusInterface.sendMessage(msg);
  ibusInterface.sendMessage(buildMessage(id, IbusDeviceId.DSPC, [0x01]));
  setTimeout(() => announce(), 3000);
};

const parseMessage = (message: FullIbusMessage) => {
  switch (message.msg[0]) {
    default:
      log.warn('Unhandled message!', message.msg);
  }
};

export const DSP: Device = {
  id,
  init,
  term,
  parseMessage,
};
