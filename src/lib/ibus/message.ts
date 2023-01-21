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
  message: byte[]
): IbusMessage => {
  return { src, dst, msg: Buffer.from(message) };
};
