import { describe, expect, test } from 'vitest';
import { ascii2hex, ascii2paddedHex, wrapCharTestCode } from '../../src/ibus/message.js';

const codepoints = Array.from(Array(96 + 32).keys())
  .slice(32)
  .concat(Array.from(Array(48 + 160).keys()).slice(160))
  .map((n) => [String.fromCharCode(n), n]);

describe('ascii2hex', () => {
  test('ascii text should be converted to hex', () => {
    const result = ascii2hex('Hello world!');
    expect(result).toStrictEqual(Buffer.from([0x48, 0x65, 0x6c, 0x6c, 0x6f, 0x20, 0x77, 0x6f, 0x72, 0x6c, 0x64, 0x21]));
  });
  test('ascii text should be converted to hex and truncated', () => {
    const result = ascii2hex('Hello world!', 5);
    expect(result).toStrictEqual(Buffer.from([0x48, 0x65, 0x6c, 0x6c, 0x6f]));
  });
  test.each(codepoints)(
    "character '%s' should be converted to its correct codepoint=%s",
    (...args: (string | number)[]) => {
      const [char, expected] = args as [string, number];
      expect(ascii2hex(char)).toStrictEqual(Buffer.from([expected]));
    },
  );
});

describe('ascii2paddedhex', () => {
  test('ascii text should be converted to hex and padded', () => {
    const result = ascii2paddedHex('Hello world!', 15);
    expect(result).toStrictEqual(
      Buffer.from([0x48, 0x65, 0x6c, 0x6c, 0x6f, 0x20, 0x77, 0x6f, 0x72, 0x6c, 0x64, 0x21, 0x20, 0x20, 0x20]),
    );
  });
  test('ascii text does not need to be padded if text length is the same as the desired length', () => {
    const result = ascii2paddedHex('Hello', 5);
    expect(result).toStrictEqual(Buffer.from([0x48, 0x65, 0x6c, 0x6c, 0x6f]));
  });
});

describe('wrapCharTestCode', () => {
  test('steps forward and backward by the given steps', () => {
    expect(wrapCharTestCode(0x41, 1)).toBe(0x42);
    expect(wrapCharTestCode(0x41, -1)).toBe(0x40);
    expect(wrapCharTestCode(0x41, 3)).toBe(0x44);
  });
  test('wraps around at both ends of the range', () => {
    expect(wrapCharTestCode(0xff, 1)).toBe(0x20);
    expect(wrapCharTestCode(0x20, -1)).toBe(0xff);
    expect(wrapCharTestCode(0xfe, 4)).toBe(0x22);
    expect(wrapCharTestCode(0x21, -3)).toBe(0xfe);
  });
});
