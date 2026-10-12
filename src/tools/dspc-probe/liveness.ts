import { setTimeout as sleep } from 'node:timers/promises';
import { BridgeClient, BusFrame } from './bridge-client.js';
import { IDENT, isPollReply, POLL } from './dspc.js';
import { Recorder } from './recorder.js';

const REPLY_TIMEOUT_MS = 400;

// Answers "is the DSP-C still awake?" by polling it and waiting for any `EA → xx 02 ..` reply.
export class Liveness {
  lastReplyAt: number | undefined;
  private waiters: (() => void)[] = [];

  constructor(
    private readonly bridge: BridgeClient,
    private readonly recorder: Recorder,
  ) {
    bridge.on('frame', (busFrame) => this.onFrame(busFrame));
  }

  async check(attempts = 1): Promise<boolean> {
    for (let attempt = 1; attempt <= attempts; attempt++) {
      const replied = new Promise<boolean>((resolve) => this.waiters.push(() => resolve(true)));
      this.bridge.send(POLL);
      const alive = await Promise.race([replied, sleep(REPLY_TIMEOUT_MS, false)]);
      this.waiters = [];
      if (alive) {
        this.recorder.record('liveness', { alive, attempt, sinceAntOn: this.recorder.sinceAntOn() });
        return true;
      }
    }
    this.recorder.record('liveness', { alive: false, attempts, sinceAntOn: this.recorder.sinceAntOn() });
    this.recorder.print(`DSP-C did not answer ${attempts} poll(s)`);
    return false;
  }

  // Sends the diagnostic ident that unlocks poll replies after a power-up, then checks again.
  async wake(): Promise<boolean> {
    this.bridge.send(IDENT);
    await sleep(300);
    return this.check(2);
  }

  private onFrame({ message, echo }: BusFrame): void {
    if (echo || !isPollReply(message)) {
      return;
    }
    this.lastReplyAt = Date.now();
    this.waiters.forEach((resolve) => resolve());
  }
}
