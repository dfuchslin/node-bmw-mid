import { describe, expect, test } from 'vitest';
import { frameHex } from '../../src/tools/frames.js';
import {
  BLOCK_SIZE,
  blockStart,
  buildSweep,
  DEFAULT_B_COMMANDS,
  DEFAULT_SOURCES,
  parseSweepSpec,
} from '../../src/tools/dspc-probe/sweep.js';

describe('parseSweepSpec', () => {
  test('B defaults to the promising command list', () => {
    expect(parseSweepSpec('B').commands).toStrictEqual(DEFAULT_B_COMMANDS);
  });

  test('command lists are hex', () => {
    expect(parseSweepSpec('c:5c,1A').commands).toStrictEqual([0x5c, 0x1a]);
  });

  test('rejects unknown kinds, bad commands and the diagnostic source', () => {
    expect(() => parseSweepSpec('D')).toThrow();
    expect(() => parseSweepSpec('B:zz')).toThrow();
    expect(() => parseSweepSpec('A', [0x3f])).toThrow();
  });
});

describe('buildSweep', () => {
  test('A sends every command byte to the DSP-C from each default source', () => {
    const items = buildSweep(parseSweepSpec('A'));
    expect(items).toHaveLength(256 * DEFAULT_SOURCES.length);
    expect(frameHex(items[0])).toBe('68 03 EA 00 81');
    expect(items.every(({ dst, msg }) => dst === 0xea && msg.length === 1)).toBe(true);
  });

  test('B adds one data byte per command and source', () => {
    const items = buildSweep(parseSweepSpec('B:34', [0x68]));
    expect(items).toHaveLength(256);
    expect(frameHex(items[0x28])).toBe('68 04 EA 34 28 9A');
  });

  test('C broadcasts to GLO and LOC, with data bytes only for the listed commands', () => {
    const plain = buildSweep(parseSweepSpec('C', [0xd0]));
    expect(plain).toHaveLength(2 * 256);
    expect(plain.every(({ dst }) => dst === 0xbf || dst === 0xff)).toBe(true);
    expect(buildSweep(parseSweepSpec('C:5C', [0xd0]))).toHaveLength(2 * 256 * 2);
  });

  test('never sends from the diagnostic address', () => {
    ['A', 'B', 'C:5C'].forEach((spec) =>
      expect(buildSweep(parseSweepSpec(spec)).some(({ src }) => src === 0x3f)).toBe(false),
    );
  });
});

describe('blockStart', () => {
  test('rewinds to the start of the liveness block', () => {
    expect(blockStart(0)).toBe(0);
    expect(blockStart(BLOCK_SIZE - 1)).toBe(0);
    expect(blockStart(BLOCK_SIZE)).toBe(BLOCK_SIZE);
    expect(blockStart(3 * BLOCK_SIZE + 5)).toBe(3 * BLOCK_SIZE);
  });
});
