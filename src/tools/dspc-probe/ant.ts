import * as pigpioClient from 'pigpio-client';
import Logger from '../../lib/log.js';
import { Recorder } from './recorder.js';

const context = 'probe-ant';
const log = Logger.get(context);
// pigpio-client takes ~5s to connect to rpi-bmwmid from a workstation
const CONNECT_TIMEOUT_MS = 20000;

// Switches the DSP-C's ANT input (its effective power switch, shared with the button light) through
// pigpiod on the Pi. The power pin is only ever switched on, as the main app does at startup, so the
// MID stays powered while the main app is stopped. Without GPIO, ANT steps are logged and skipped.
export class Ant {
  private ant: any;
  private power: any;
  private pigpio: any;

  constructor(private readonly recorder: Recorder) {}

  async init(host: string, pins: { power: number; ant: number }): Promise<void> {
    this.pigpio = pigpioClient.pigpio({ host });
    try {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`no pigpiod answer from ${host}`)), CONNECT_TIMEOUT_MS);
        this.pigpio.once('connected', () => resolve(clearTimeout(timer)));
        this.pigpio.once('error', reject);
      });
    } catch (err) {
      log.error('GPIO unavailable — ANT steps will be skipped: %s', (err as Error).message);
      this.pigpio.destroy();
      this.pigpio = undefined;
      return;
    }

    this.ant = this.pigpio.gpio(pins.ant);
    this.power = this.pigpio.gpio(pins.power);
    await this.ant.modeSet('output');
    await this.power.modeSet('output');
    await this.power.write(1);
    log.notice('GPIO connected to %s (power pin %d on, ANT pin %d)', host, pins.power, pins.ant);
  }

  async set(on: boolean): Promise<void> {
    const label = on ? 'ANT ON' : 'ANT OFF';
    if (!this.ant) {
      this.recorder.marker(`${label} (skipped: no GPIO)`);
      return;
    }
    await this.ant.write(on ? 1 : 0);
    this.recorder.antOnAt = on ? Date.now() : undefined;
    this.recorder.marker(label);
  }

  async read(): Promise<boolean | undefined> {
    return this.ant ? Boolean(await this.ant.read()) : undefined;
  }

  term(): void {
    // ANT is left as is: the bench state should survive between probe runs.
    this.pigpio?.destroy();
  }
}
