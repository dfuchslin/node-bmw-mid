import { IbusDeviceId, IbusMessage, byte } from '../../types';

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

export const buildMessage = (
  src: IbusDeviceId,
  dst: IbusDeviceId,
  message: byte[] | Buffer
): IbusMessage => {
  return { src, dst, msg: Buffer.from(message) };
};

export const ascii2hex = (text: string, length = -1): Buffer => {
  // TODO transcode utf8 text to displayable characters
  const buf = Buffer.from(text, 'utf8');
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
