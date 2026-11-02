import iconv from '../lib/iconv.js';
import { byte, IbusDeviceId, IbusMessage } from '../types/index.js';

export const deviceStatus = (src: IbusDeviceId) => {
  let dst;
  switch (src) {
    case IbusDeviceId.CDC:
    case IbusDeviceId.RAD:
      dst = IbusDeviceId.LOC;
      break;

    default:
      dst = IbusDeviceId.GLO;
  }
  return buildMessage(src, dst, [0x02, 0x00]);
};

export const buildMessage = (src: IbusDeviceId, dst: IbusDeviceId, message: byte[] | Buffer): IbusMessage => {
  return { src, dst, msg: Buffer.from(message) };
};

export const utf82hex = (text: string, length = -1): Buffer => {
  return ascii2hex(iconv.utf8_ibusascii(text), length);
};

export const utf82paddedHex = (text: string, length: number): Buffer => {
  return ascii2paddedHex(iconv.utf8_ibusascii(text), length);
};

export const ascii2hex = (text: string, length = -1): Buffer => {
  const buf = Buffer.from(text, 'ascii');
  if (length < 0) {
    return buf;
  }
  return buf.subarray(0, length);
};

export const ascii2paddedHex = (text: string, length: number): Buffer => {
  const unpadded = ascii2hex(text, length);
  if (text.length >= length) {
    return unpadded;
  }
  const padding = Buffer.alloc(length - text.length, 0x20);
  return Buffer.concat([unpadded, padding]);
};

// Code-point range the char test (/chartest/:state) scrolls through. Bytes below 0x20
// are control-ish on the MID (e.g. 0x05 is the button-row separator), so they're skipped.
export const CHAR_TEST_FIRST = 0x20;
export const CHAR_TEST_LAST = 0xff;

// Steps `code` by `steps` within CHAR_TEST_FIRST..CHAR_TEST_LAST, wrapping at both ends.
export const wrapCharTestCode = (code: number, steps: number): number => {
  const span = CHAR_TEST_LAST - CHAR_TEST_FIRST + 1;
  return CHAR_TEST_FIRST + ((((code - CHAR_TEST_FIRST + steps) % span) + span) % span);
};
