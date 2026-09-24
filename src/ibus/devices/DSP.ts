import { IbusInterface } from '../../lib/ibus/index.js';
import Logger from '../../lib/log.js';
import { Device, FullIbusMessage, IbusDeviceId } from '../../types/index.js';

const id = IbusDeviceId.DSP;
const context = IbusDeviceId[id].toLowerCase();
const log = Logger.get(context);

const init = (_ibusInterface: IbusInterface) => {
  log.notice('init');
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

export const DSP: Device = {
  id,
  init,
  term,
  parseMessage,
};
