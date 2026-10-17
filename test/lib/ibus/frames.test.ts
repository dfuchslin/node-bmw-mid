import { describe, expect, test } from 'vitest';
import { frameHex, matchesFrame, parseFrame, toHex } from '../../../src/lib/ibus/frames.js';

describe('parseFrame', () => {
  test('full frame is parsed and verified', () => {
    const { message, error } = parseFrame('3F 03 EA 00 D6');
    expect(error).toBeUndefined();
    expect(message).toStrictEqual({ src: 0x3f, dst: 0xea, msg: Buffer.from([0x00]) });
  });

  test('full frame accepts lowercase and extra whitespace', () => {
    expect(parseFrame('  6a 04 ff 02 01   92 ').message).toStrictEqual({
      src: 0x6a,
      dst: 0xff,
      msg: Buffer.from([0x02, 0x01]),
    });
  });

  test('wrong checksum is rejected', () => {
    expect(parseFrame('3F 03 EA 00 D7').error).toMatch(/CHK/);
  });

  test('wrong length is rejected', () => {
    expect(parseFrame('3F 04 EA 00 D6').error).toMatch(/LEN/);
  });

  test('short form computes length and checksum', () => {
    const { message } = parseFrame('!68 FF 36 AF');
    expect(message && frameHex(message)).toBe('68 04 FF 36 AF 0A');
  });

  test('garbage is rejected', () => {
    expect(parseFrame('68 04 XX').error).toBeDefined();
    expect(parseFrame('!68 FF').error).toBeDefined();
    expect(parseFrame('68 03 FF').error).toBeDefined();
  });

  test.each([
    '80 07 BF 15 01 04 80 42 EA',
    '6A 0D EA 35 06 07 27 08 29 4A 69 88 A7 C6 75',
    'D0 05 BF 5C FF 00 C9',
    '67 03 EA 01 8F',
  ])('frames from DEBUG-DSPC.md round-trip: %s', (hex) => {
    const { message } = parseFrame(hex);
    expect(message && frameHex(message)).toBe(hex);
  });
});

describe('toHex', () => {
  test('pads and uppercases', () => {
    expect(toHex([0x0a, 0xff, 0x00])).toBe('0A FF 00');
  });
});

describe('matchesFrame', () => {
  const message = { src: 0xea, dst: 0x6a, msg: Buffer.from([0x34, 0x28]) };

  test('matches on src, dst and prefix', () => {
    expect(matchesFrame(message, { src: 0xea, dst: 0x6a, prefix: [0x34, 0x28] })).toBe(true);
    expect(matchesFrame(message, { dst: [0x68, 0x6a], prefix: [0x34] })).toBe(true);
  });

  test('rejects any mismatch', () => {
    expect(matchesFrame(message, { src: 0x68 })).toBe(false);
    expect(matchesFrame(message, { dst: [0x68, 0x80] })).toBe(false);
    expect(matchesFrame(message, { prefix: [0x34, 0x08] })).toBe(false);
  });
});
