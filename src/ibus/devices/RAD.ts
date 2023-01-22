import { IbusInterface } from '../../lib/ibus';
import Logger from '../../lib/log';
import { Device, FullIbusMessage, IbusDeviceId } from '../../types';

const id = IbusDeviceId.RAD;
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
    case 0x32: {
      handleVolume(message);
      break;
    }
    default:
      log.warn('Unhandled message!', message.msg);
  }
};

const handleVolume = (message: FullIbusMessage) => {
  // Broadcast: Volume control
  // data.msg[1] -
  // -1 : 10
  // -2 : 20
  // -3 : 30
  // -4 : 40
  // -5 : 50
  // +1 : 11
  // +2 : 21
  // +3 : 31
  // +4 : 41
  // +5 : 51

  const volume = message.msg[1];

  // Determine volume change direction
  const direction = volume & 0x01 && true ? '+' : '-';
  const volume_inc = Math.floor(volume / 0x10);

  log.notice('volume ' + direction + volume_inc + ' (' + volume + ')');
};

export const RAD: Device = {
  id,
  init,
  term,
  parseMessage,
};
