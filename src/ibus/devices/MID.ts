import { IbusInterface } from '../../lib/ibus';
import Logger from '../../lib/log';
import { Device, FullIbusMessage, IbusDeviceId } from '../../types';

const id = IbusDeviceId.MID;
const context = IbusDeviceId[id].toLowerCase();
const log = Logger.get(context);
let ibusInterface: IbusInterface;

const init = (_ibusInterface: IbusInterface) => {
  log.notice('init');
  ibusInterface = _ibusInterface;
};

const term = () => {
  log.notice('term');
};

const parseMessage = (message: FullIbusMessage) => {
  // the real MID should be responding to all messages sent to it so this could should be theoretically be removed
  switch (message.msg[0]) {
    default:
      log.warn('Unhandled message!', message.msg);
  }
};

export const MID: Device = {
  id,
  init,
  term,
  parseMessage,
};

// ✖ ibus-router unhandled src:MID dst:LOC msg:  �
