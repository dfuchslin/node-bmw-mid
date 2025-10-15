export * from './device.js';

export type FullIbusMessage = IbusMessage & {
  id: number;
  len: number;
  crc: number;
};

export type IbusMessage = {
  src: number;
  dst: number;
  msg: Buffer;
};

export type byte = number;
