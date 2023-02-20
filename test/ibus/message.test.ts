import { describe, expect, test } from '@jest/globals';
import each from 'jest-each';
import { ascii2hex, ascii2paddedHex } from '../../src/ibus/message';

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
  each(codepoints).test(
    "character '%s' should be converted to its correct codepoint=%s",
    (char: string, expected: number) => {
      expect(ascii2hex(char)).toStrictEqual(Buffer.from([expected]));
    }
  );
});

describe('ascii2paddedhex', () => {
  test('ascii text should be converted to hex and padded', () => {
    const result = ascii2paddedHex('Hello world!', 15);
    expect(result).toStrictEqual(
      Buffer.from([0x48, 0x65, 0x6c, 0x6c, 0x6f, 0x20, 0x77, 0x6f, 0x72, 0x6c, 0x64, 0x21, 0x20, 0x20, 0x20])
    );
  });
  test('ascii text does not need to be padded if text length is the same as the desired length', () => {
    const result = ascii2paddedHex('Hello', 5);
    expect(result).toStrictEqual(Buffer.from([0x48, 0x65, 0x6c, 0x6c, 0x6f]));
  });
});
