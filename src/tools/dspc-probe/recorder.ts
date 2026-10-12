import fs from 'node:fs';
import path from 'node:path';
import { BridgeClient, BridgeEvent, BusFrame } from './bridge-client.js';
import { DSPC, isKnownDspcFrame, isResetAnnounce } from './dspc.js';

const ansi = (code: string) => (text: string) => (process.stdout.isTTY ? `\x1b[${code}m${text}\x1b[0m` : text);
const color = { dim: ansi('2'), yellow: ansi('33'), red: ansi('1;31'), cyan: ansi('36') };

export type DspcSighting = {
  hex: string;
  count: number;
  firstMs: number | undefined;
  isNew: boolean;
  isReset: boolean;
};

export type RunSummary = {
  label: string;
  durationMs: number;
  dspc: DspcSighting[];
  newFrames: number;
  resetAnnounces: number;
  echoMissing: number;
};

type Run = { label: string; startedAt: number; dspc: Map<string, DspcSighting>; echoMissing: number };

// Writes every bridge and probe event to a JSONL file (the source of truth for analysis) and prints a
// human-readable bus trace. It also tallies DSP-C frames per run so scenarios can print a summary.
export class Recorder {
  readonly file: string;
  antOnAt: number | undefined;
  private readonly stream: fs.WriteStream;
  private readonly startedAt = Date.now();
  private run: Run | undefined;
  private bridge: BridgeClient | undefined;

  constructor(logDir: string, name: string) {
    fs.mkdirSync(logDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    this.file = path.join(logDir, `${stamp}-${name.replace(/[^\w@.-]+/g, '_')}.jsonl`);
    this.stream = fs.createWriteStream(this.file, { flags: 'a' });
    this.print(color.cyan(`log: ${this.file}`));
  }

  attach(bridge: BridgeClient): void {
    this.bridge = bridge;
    bridge.on('event', (event) => this.onBridgeEvent(event));
    bridge.on('frame', (frame) => this.onFrame(frame));
  }

  record(type: string, data: Record<string, unknown> = {}): void {
    this.stream.write(JSON.stringify({ t: Date.now(), type, ...data }) + '\n');
  }

  marker(text: string): void {
    this.record('marker', { text });
    this.bridge?.marker(text);
    this.print(color.cyan(`-- ${text}`));
  }

  // Milliseconds since the last ANT ON, the reference point for DSP-C reaction times.
  sinceAntOn(): number | undefined {
    return this.antOnAt === undefined ? undefined : Date.now() - this.antOnAt;
  }

  beginRun(label: string): void {
    this.run = { label, startedAt: Date.now(), dspc: new Map(), echoMissing: 0 };
    this.marker(`run start: ${label}`);
  }

  endRun(): RunSummary | undefined {
    const run = this.run;
    if (!run) {
      return undefined;
    }
    this.run = undefined;
    const dspc = [...run.dspc.values()];
    const summary: RunSummary = {
      label: run.label,
      durationMs: Date.now() - run.startedAt,
      dspc,
      newFrames: dspc.filter((sighting) => sighting.isNew).length,
      resetAnnounces: dspc.filter((sighting) => sighting.isReset).length,
      echoMissing: run.echoMissing,
    };
    this.record('runSummary', summary);
    this.marker(`run end: ${run.label}`);
    return summary;
  }

  print(line: string): void {
    const elapsed = ((Date.now() - this.startedAt) / 1000).toFixed(3).padStart(9);
    process.stdout.write(`${color.dim(elapsed)}  ${line}\n`);
  }

  close(): Promise<void> {
    return new Promise((resolve) => this.stream.end(resolve));
  }

  private onBridgeEvent(event: BridgeEvent): void {
    this.record('bridge', event);
    switch (event.type) {
      case 'echoMissing':
        if (this.run) {
          this.run.echoMissing++;
        }
        this.print(color.red(`!! NO ECHO for [${event.hex}] (stuck at ${event.stage}, queue ${event.queue})`));
        break;

      case 'error':
        this.print(color.red(`!! bridge error: ${event.message}`));
        break;

      default:
        break;
    }
  }

  private onFrame({ message, hex, echo }: BusFrame): void {
    if (echo) {
      this.print(color.dim(`tx ${hex}`));
      return;
    }

    if (message.src !== DSPC) {
      this.print(`rx ${hex}`);
      return;
    }

    const sinceAntOn = this.sinceAntOn();
    const isNew = !isKnownDspcFrame(message);
    const isReset = isResetAnnounce(message);
    const timing = sinceAntOn === undefined ? '' : ` (+${sinceAntOn}ms since ANT ON)`;
    const label = isReset ? 'RESET ANNOUNCE' : isNew ? 'NEW' : 'dspc';
    this.print((isNew ? color.red : color.yellow)(`rx ${hex}  ◀ ${label}${timing}`));
    this.record('dspc', { hex, isNew, sinceAntOn, run: this.run?.label });

    if (!this.run) {
      return;
    }
    const sighting = this.run.dspc.get(hex) ?? { hex, count: 0, firstMs: sinceAntOn, isNew, isReset };
    sighting.count++;
    this.run.dspc.set(hex, sighting);
  }
}

export const formatSummary = (summary: RunSummary): string => {
  const frames = summary.dspc.length
    ? summary.dspc
        .map(
          (s) => `${s.isNew ? 'NEW ' : ''}[${s.hex}] x${s.count}${s.firstMs === undefined ? '' : ` @${s.firstMs}ms`}`,
        )
        .join(', ')
    : 'no DSP-C frames';
  const warnings = summary.echoMissing ? ` — ${summary.echoMissing} missing echoes` : '';
  return `${summary.label}: ${frames}${warnings}`;
};
