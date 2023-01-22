import { IbusInterface } from '../../lib/ibus';
import { ascii2paddedHex, buildMessage } from '../../lib/ibus/message';
import Logger from '../../lib/log';
import { Device, FullIbusMessage, IbusDeviceId } from '../../types';

const id = IbusDeviceId.RAD;
const namespace = IbusDeviceId[id].toLowerCase();
const log = Logger.get(namespace);
let ibusInterface: IbusInterface;

let main_volume = 0;

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

  switch (direction) {
    case '+':
      main_volume = main_volume + volume_inc;
      break;
    case '-':
      main_volume = main_volume - volume_inc;
  }

  // Disregard min and max volume levels
  if (main_volume < 1) main_volume = 0;
  if (main_volume > 100) main_volume = 100;

  log.notice('volume ' + direction + volume_inc + ' (' + volume + ') --> ' + main_volume);

  // Upper left - 11 char radio display
  let msg = Buffer.from([0x23, 0x40, 0x20]);
  msg = Buffer.concat([msg, ascii2paddedHex(`Vol ${main_volume}`, 11)]);
  ibusInterface.sendMessage(buildMessage(id, message.src, msg));
};

export const RAD: Device = {
  id,
  init,
  term,
  parseMessage,
};
