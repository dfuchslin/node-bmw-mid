import { describe, expect, test } from 'vitest';
import { AmpState } from '../../src/tools/dspc-probe/amp.js';
import { frameHex } from '../../src/tools/frames.js';

const request = (...msg: number[]) => ({ src: 0xea, dst: 0x6a, msg: Buffer.from(msg) });

describe('AmpState', () => {
  test('initial status is the amp memory frame from the real E38 capture', () => {
    expect(frameHex(new AmpState().status())).toBe('6A 0D EA 35 06 07 27 08 29 4A 69 88 A7 C6 75');
  });

  test('settings request is answered with the current status', () => {
    const amp = new AmpState();
    expect(amp.handle(request(0x34, 0x28))).toStrictEqual(amp.status());
  });

  test('mode select sets the mode byte, wrapping 0F → 08 as seen on the bench', () => {
    const amp = new AmpState();
    expect(amp.handle(request(0x34, 0x0d))?.msg[1]).toBe(0x05);
    expect(amp.handle(request(0x34, 0x08))?.msg[1]).toBe(0x00);
  });

  test('EQ band command (34 10 09 from the bench) replaces that band of the addressed mode', () => {
    const amp = new AmpState();
    amp.handle(request(0x34, 0x08));
    const reply = amp.handle(request(0x34, 0x10, 0x09));
    expect(reply?.msg.subarray(4)).toStrictEqual(Buffer.from([0x09, 0x29, 0x4a, 0x69, 0x88, 0xa7, 0xc6]));
  });

  test('room (0x20 set) and echo commands (34 90 26 / 34 90 06 from the bench)', () => {
    const amp = new AmpState();
    amp.handle(request(0x34, 0x08));
    expect(amp.handle(request(0x34, 0x90, 0x26))?.msg.subarray(1, 4)).toStrictEqual(Buffer.from([0x00, 0x07, 0x26]));
    expect(amp.handle(request(0x34, 0x90, 0x06))?.msg.subarray(1, 4)).toStrictEqual(Buffer.from([0x00, 0x06, 0x26]));
  });

  test('each mode keeps its own settings', () => {
    const amp = new AmpState();
    amp.handle(request(0x34, 0x08));
    amp.handle(request(0x34, 0x10, 0x09));
    expect(amp.handle(request(0x34, 0x09))?.msg[4]).toBe(0x08);
    expect(amp.handle(request(0x34, 0x08))?.msg[4]).toBe(0x09);
  });

  test('ignores anything that is not a 34 command', () => {
    expect(new AmpState().handle(request(0x01))).toBeUndefined();
  });
});
