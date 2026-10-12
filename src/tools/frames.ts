import { createBufferFromIbusMessage } from '../lib/ibus/IbusProtocol.js';
import { IbusMessage } from '../types/index.js';

// Pure helpers for writing/reading I-Bus frames as hex text, shared by the bridge and the probe.

export const toHex = (bytes: Uint8Array | number[]): string =>
  Array.from(bytes, (b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');

export const frameHex = (message: IbusMessage): string => toHex(createBufferFromIbusMessage(message));

export type ParsedFrame = { message: IbusMessage; error?: undefined } | { message?: undefined; error: string };

const parseBytes = (text: string): number[] | undefined => {
  const tokens = text.trim().split(/\s+/).filter(Boolean);
  const bytes = tokens.map((token) => (/^[0-9a-fA-F]{1,2}$/.test(token) ? parseInt(token, 16) : NaN));
  return bytes.some(Number.isNaN) ? undefined : bytes;
};

// Accepts either a full frame exactly as it appears on the bus ("SRC LEN DST DATA... CHK", LEN and CHK
// are verified) or a short form prefixed with "!" ("!SRC DST DATA...", LEN and CHK are computed).
export const parseFrame = (text: string): ParsedFrame => {
  const trimmed = text.trim();
  const auto = trimmed.startsWith('!');
  const bytes = parseBytes(auto ? trimmed.slice(1) : trimmed);
  if (!bytes) {
    return { error: `not space-separated hex bytes: "${text}"` };
  }

  if (auto) {
    if (bytes.length < 3) {
      return { error: `short form needs at least SRC DST CMD: "${text}"` };
    }
    const [src, dst, ...data] = bytes;
    return { message: { src, dst, msg: Buffer.from(data) } };
  }

  if (bytes.length < 5) {
    return { error: `frame needs at least SRC LEN DST CMD CHK: "${text}"` };
  }
  const [src, len, dst, ...rest] = bytes;
  if (len !== bytes.length - 2) {
    return { error: `LEN is 0x${toHex([len])} but ${bytes.length - 2} bytes follow it: "${text}"` };
  }
  const chk = rest.pop() as number;
  const message = { src, dst, msg: Buffer.from(rest) };
  const expected = createBufferFromIbusMessage(message).at(-1) as number;
  if (chk !== expected) {
    return { error: `CHK is 0x${toHex([chk])}, expected 0x${toHex([expected])}: "${text}"` };
  }
  return { message };
};

export type FrameMatcher = { src?: number; dst?: number | number[]; prefix?: number[] };

export const matchesFrame = (message: IbusMessage, { src, dst, prefix = [] }: FrameMatcher): boolean => {
  if (src !== undefined && message.src !== src) {
    return false;
  }
  if (dst !== undefined && !(Array.isArray(dst) ? dst : [dst]).includes(message.dst)) {
    return false;
  }
  return prefix.every((byte, i) => message.msg[i] === byte);
};
