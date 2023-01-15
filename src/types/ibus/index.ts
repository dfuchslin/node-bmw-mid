export type FullIbusMessage = IbusMessage & {
  id: number;
  len: string;
  crc: string;
};

export type IbusMessage = {
  src: number;
  dst: number;
  msg: Buffer;
};
