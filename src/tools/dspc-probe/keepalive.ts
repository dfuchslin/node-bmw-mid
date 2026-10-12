import { IbusMessage } from '../../types/index.js';
import { parseFrame } from '../frames.js';
import { BridgeClient } from './bridge-client.js';
import { Recorder } from './recorder.js';

// Periodic frames a real car would put on the bus. Each entry has its own interval and can be switched
// on or off independently, by name.
export const KEEP_ALIVE_CATALOG = {
  'ike-speed': { frame: '80 05 BF 18 00 00 22', intervalMs: 2000 }, // IKE → GLO: speed/RPM
  'ike-ignition': { frame: '80 04 BF 11 03 29', intervalMs: 10000 }, // IKE → GLO: ignition on (KL15)
  'ike-status': { frame: '80 04 BF 02 00 39', intervalMs: 10000 }, // IKE → GLO: device ready
  'lcm-lights': { frame: 'D0 07 BF 5B 00 00 00 00 33', intervalMs: 10000 }, // LCM → GLO: lamp status
  'lcm-dimmer': { frame: 'D0 05 BF 5C FF 00 C9', intervalMs: 10000 }, // LCM → GLO: instrument backlight (58G) max
  'amp-status': { frame: '6A 04 FF 02 00 93', intervalMs: 10000 }, // DSP → LOC: device ready
  'rad-status': { frame: '68 04 FF 02 00 91', intervalMs: 10000 }, // RAD → LOC: device ready
  'poll-dspc': { frame: '67 03 EA 01 8F', intervalMs: 10000 }, // 0x67 → DSP-C: poll (keeps it awake)
} as const;

export type KeepAliveName = keyof typeof KEEP_ALIVE_CATALOG;
export const KEEP_ALIVE_NAMES = Object.keys(KEEP_ALIVE_CATALOG) as KeepAliveName[];
export const CAR_KEEP_ALIVE: KeepAliveName[] = [
  'ike-speed',
  'ike-ignition',
  'ike-status',
  'lcm-lights',
  'lcm-dimmer',
  'amp-status',
  'poll-dspc',
];

export class KeepAlive {
  private timers = new Map<KeepAliveName, NodeJS.Timeout>();

  constructor(
    private readonly bridge: BridgeClient,
    private readonly recorder: Recorder,
  ) {}

  // Replaces the running set: entries not listed are stopped, newly listed ones start immediately.
  set(names: KeepAliveName[]): void {
    this.timers.forEach((timer, name) => {
      if (!names.includes(name)) {
        clearInterval(timer);
        this.timers.delete(name);
      }
    });

    names
      .filter((name) => !this.timers.has(name))
      .forEach((name) => {
        const { frame, intervalMs } = KEEP_ALIVE_CATALOG[name];
        const message = parseFrame(frame).message as IbusMessage;
        this.bridge.send(message);
        this.timers.set(
          name,
          setInterval(() => this.bridge.send(message), intervalMs),
        );
      });

    this.recorder.marker(`keep-alive: ${names.length ? names.join(', ') : 'off'}`);
  }

  stop(): void {
    if (this.timers.size) {
      this.set([]);
    }
  }
}
