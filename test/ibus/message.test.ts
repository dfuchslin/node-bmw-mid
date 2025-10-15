import { describe, expect, test } from 'vitest';
import { ascii2hex, ascii2paddedHex } from '../../src/ibus/message.js';

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
      const char = args[0] as string;
      const expected = args[1] as number;
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
