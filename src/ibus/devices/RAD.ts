import { ascii2paddedHex, buildMessage } from '@/ibus/message.js';
import { IbusInterface } from '@/lib/ibus/index.js';
import Logger from '@/lib/log.js';
import { Device, FullIbusMessage, IbusDeviceId } from '@/types/index.js';

const id = IbusDeviceId.RAD;
const context = IbusDeviceId[id].toLowerCase();
const log = Logger.get(context);
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

const createProgressBars = (width: number) => {
  const result: number[][] = [];
  let i = 0;
  while (i < width) {
    [0xbf, 0xb0, 0xb1, 0xb9, 0xcf].forEach((char) => {
      const row = new Array(width).fill(0x5f);
      row[i] = char;
      result.push(row);
    });
    i++;
  }
  return result;
};
const volumeProgressBars = createProgressBars(10);
let volumeTimestamp = 0;

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

  let progressBarIndex = Math.floor((main_volume / 100) * volumeProgressBars.length);
  if (progressBarIndex >= volumeProgressBars.length) progressBarIndex = volumeProgressBars.length - 1;
  if (progressBarIndex < 0) progressBarIndex = 0;

  log.notice(`volume ${direction} ${volume_inc} (${volume}) --> ${main_volume}`);

  // Upper left - 11 char radio display
  let msg = Buffer.from([0x23, 0x40, 0x20]);
  msg = Buffer.concat([msg, ascii2paddedHex(`Vol ${main_volume}`, 11)]);
  ibusInterface.sendMessage(buildMessage(id, message.src, msg));

  // Upper right - 20 char obc display
  msg = Buffer.from([0x23, 0x40, 0x20]);
  msg = Buffer.concat([
    msg,
    Buffer.from([0xc6, 0xc8, 0x20]),
    Buffer.from(volumeProgressBars[progressBarIndex]),
    Buffer.from(new Array(7).fill(0x20)),
  ]);
  ibusInterface.sendMessage(buildMessage(IbusDeviceId.IKE, message.src, msg));

  volumeTimestamp = new Date().getTime();
  setTimeout(() => {
    if (new Date().getTime() - volumeTimestamp >= 5_000) {
      clearScreen();
    }
  }, 5_000);

  /*
  // Left side menu
  msg = Buffer.from([0x21, 0x00, 0x15, 0x20]);
  msg = Buffer.concat([msg, Buffer.from(solidProgressBar), Buffer.from([0x05])]);
  msg = Buffer.concat([msg, Buffer.from(solidProgressBar), Buffer.from([0x05])]);
  msg = Buffer.concat([msg, Buffer.from(solidProgressBar), Buffer.from([0x05])]);
  msg = Buffer.concat([msg, Buffer.from(solidProgressBar), Buffer.from([0x05])]);
  msg = Buffer.concat([msg, Buffer.from(solidProgressBar), Buffer.from([0x05])]);
  msg = Buffer.concat([msg, Buffer.from(solidProgressBar)]);
  ibusInterface.sendMessage(buildMessage(id, message.src, msg));

  // Right side menu
  msg = Buffer.from([0x21, 0x00, 0x15, 0x06]);
  msg = Buffer.concat([msg, Buffer.from(solidProgressBar), Buffer.from([0x05])]);
  msg = Buffer.concat([msg, Buffer.from(solidProgressBar), Buffer.from([0x05])]);
  msg = Buffer.concat([msg, Buffer.from(solidProgressBar), Buffer.from([0x05])]);
  msg = Buffer.concat([msg, Buffer.from(solidProgressBar), Buffer.from([0x05])]);
  msg = Buffer.concat([msg, Buffer.from(solidProgressBar), Buffer.from([0x05])]);
  msg = Buffer.concat([msg, Buffer.from(solidProgressBar)]);
  ibusInterface.sendMessage(buildMessage(id, message.src, msg));
  */

  /*
  // node-ibus-mediacenterMID-master MidDevice.js (puts "MP3" right aligned in the last button to the right)
  msg = Buffer.from([0x21, 0x40, 0x00, 0x09, 0x05, 0x05, 0x4d, 0x50, 0x33]);
  ibusInterface.sendMessage(buildMessage(IbusDeviceId.RAD, IbusDeviceId.MID, msg));
  // displays "^ find v' 'ok  back' 'play   q' in the left buttons
  msg = Buffer.concat([
    Buffer.from([0x21, 0x40, 0x00, 0x40, 0x06]),
    ascii2paddedHex('^ FIND ', 7),
    Buffer.from([0xc1, 0x06]),
    ascii2paddedHex('OK  BACK', 8),
    Buffer.from([0x20, 0x06]),
    ascii2paddedHex('PLAY   Q', 8),
  ]);
  ibusInterface.sendMessage(buildMessage(IbusDeviceId.RAD, IbusDeviceId.MID, msg));
  */

  /*
  // nodejs-ibus RadioEventListener.js
  // left top '   {{{{{{{'
  msg = Buffer.concat([
    Buffer.from([0x23, 0x00, 0x22]),
    Buffer.alloc(3, '123', 'hex'),
    Buffer.alloc(7, Number(123).toString(16), 'hex'),
  ]);
  ibusInterface.sendMessage(buildMessage(IbusDeviceId.RAD, IbusDeviceId.MID, msg));

  // right top blanked out
  msg = Buffer.concat([
    Buffer.from([0x23, 0xe0, 0x80]),
    Buffer.alloc(22, Number(456).toString(16), 'hex'),
  ]);
  ibusInterface.sendMessage(buildMessage(IbusDeviceId.RAD, IbusDeviceId.MID, msg));

  // clear screen
  msg = new Buffer([0x23, 0xe0, 0x20]);
  ibusInterface.sendMessage(buildMessage(IbusDeviceId.RAD, IbusDeviceId.MID, msg));
  */
};

const clearScreen = () => {
  /*
  // Upper left - 11 char radio display
  let msg = Buffer.from([0x23, 0x40, 0x20]);
  msg = Buffer.concat([msg, Buffer.from(new Array(11).fill(0x20))]);
  ibusInterface.sendMessage(buildMessage(id, IbusDeviceId.MID, msg));

  // Upper right - 20 char obc display
  msg = Buffer.from([0x23, 0x40, 0x20]);
  msg = Buffer.concat([msg, Buffer.from(new Array(20).fill(0x20))]);
  ibusInterface.sendMessage(buildMessage(IbusDeviceId.IKE, IbusDeviceId.MID, msg));
*/

  let msg = new Buffer([0x23, 0xe0, 0x20]);
  ibusInterface.sendMessage(buildMessage(IbusDeviceId.RAD, IbusDeviceId.MID, msg));
};

export const RAD: Device = {
  id,
  init,
  term,
  parseMessage,
};
