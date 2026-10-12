import fs from 'node:fs';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { IbusDeviceId, IbusMessage } from '../../types/index.js';
import { frameHex, toHex } from '../frames.js';
import { BusFrame } from './bridge-client.js';
import { DSPC, isKnownDspcFrame, isResetAnnounce } from './dspc.js';
import { Probe } from './probe.js';

// Blind command sweeps toward the DSP-C, never from the diagnostic address 0x3F (diagnostic jobs can
// write, clear or code).
//   A           every command byte 00..FF, no data, to EA, from each source
//   B[:cmds]    command + one data byte 00..FF, to EA, from each source
//   C[:cmds]    broadcasts (BF/FF) of every command, no data; plus one data byte 00..FF for `cmds`

export const DEFAULT_SOURCES = [
  IbusDeviceId.RAD,
  IbusDeviceId.DSP,
  IbusDeviceId.IKE,
  IbusDeviceId.LCM,
  IbusDeviceId.MID,
  IbusDeviceId.GT,
  IbusDeviceId.ONL,
];
export const BROADCAST_SOURCES = [IbusDeviceId.IKE, IbusDeviceId.LCM, IbusDeviceId.RAD, IbusDeviceId.DSP];
export const DEFAULT_B_COMMANDS = [
  ...Array.from({ length: 16 }, (_, i) => 0x10 + i),
  0x32,
  0x34,
  0x35,
  0x36,
  0x5b,
  0x5c,
];

const BYTES = Array.from({ length: 256 }, (_, i) => i);

export type SweepSpec = { kind: 'A' | 'B' | 'C'; commands: number[]; sources?: number[] };

export const parseSweepSpec = (text: string, sources?: number[]): SweepSpec => {
  const [kind, list] = text.toUpperCase().split(':');
  if (kind !== 'A' && kind !== 'B' && kind !== 'C') {
    throw new Error(`unknown sweep "${text}", expected A, B[:cmds] or C[:cmds]`);
  }
  const commands = list ? list.split(',').map((cmd) => parseInt(cmd, 16)) : kind === 'B' ? DEFAULT_B_COMMANDS : [];
  if (commands.some((cmd) => Number.isNaN(cmd) || cmd < 0 || cmd > 0xff)) {
    throw new Error(`invalid command list in "${text}"`);
  }
  if (sources?.includes(IbusDeviceId.DIA)) {
    throw new Error('sweeping from the diagnostic address 0x3F is not allowed');
  }
  return { kind, commands, sources };
};

export const buildSweep = ({ kind, commands, sources }: SweepSpec): IbusMessage[] => {
  const frame = (src: number, dst: number, msg: number[]): IbusMessage => ({ src, dst, msg: Buffer.from(msg) });

  switch (kind) {
    case 'A':
      return (sources ?? DEFAULT_SOURCES).flatMap((src) => BYTES.map((cmd) => frame(src, DSPC, [cmd])));

    case 'B':
      return commands.flatMap((cmd) =>
        (sources ?? DEFAULT_SOURCES).flatMap((src) => BYTES.map((data) => frame(src, DSPC, [cmd, data]))),
      );

    case 'C': {
      const broadcastSources = sources ?? BROADCAST_SOURCES;
      const destinations = [IbusDeviceId.GLO, IbusDeviceId.LOC];
      return [
        ...broadcastSources.flatMap((src) => destinations.flatMap((dst) => BYTES.map((cmd) => frame(src, dst, [cmd])))),
        ...commands.flatMap((cmd) =>
          broadcastSources.flatMap((src) =>
            destinations.flatMap((dst) => BYTES.map((data) => frame(src, dst, [cmd, data]))),
          ),
        ),
      ];
    }

    default:
      throw new Error(`unknown sweep kind ${kind}`);
  }
};

export const BLOCK_SIZE = 16;

// Index to resume from after a hang in the block containing `index`: replay that whole block, so the
// item that hung the DSP-C gets a second chance to show itself.
export const blockStart = (index: number): number => index - (index % BLOCK_SIZE);

type Checkpoint = { spec: string; sources?: number[]; index: number; total: number };

export type SweepOptions = { spec: string; sources?: number[]; windowMs: number; resume: boolean; logDir: string };

type Hit = { index: number; hex: string; recentlySent: string[]; isReset: boolean };

export const SWEEP_EXIT_HANG = 3;

export const runSweep = async (probe: Probe, options: SweepOptions): Promise<number> => {
  const { recorder, bridge, liveness, ant } = probe;
  const items = buildSweep(parseSweepSpec(options.spec, options.sources));
  const checkpointFile = path.join(options.logDir, `sweep-${options.spec.replace(/[^\w]+/g, '_')}.checkpoint.json`);
  const saveCheckpoint = (index: number) =>
    fs.writeFileSync(
      checkpointFile,
      JSON.stringify({ spec: options.spec, sources: options.sources, index, total: items.length } as Checkpoint),
    );

  let start = 0;
  if (options.resume && fs.existsSync(checkpointFile)) {
    start = (JSON.parse(fs.readFileSync(checkpointFile, 'utf8')) as Checkpoint).index;
  }

  const etaMinutes = ((items.length - start) * (options.windowMs + 30)) / 60000;
  recorder.marker(`sweep ${options.spec}: items ${start}..${items.length - 1}, ~${etaMinutes.toFixed(1)} min`);

  if (!(await liveness.check(2)) && !(await liveness.wake())) {
    recorder.print('DSP-C not answering before the sweep starts — power it up (ANT on) first.');
    return SWEEP_EXIT_HANG;
  }

  const sent: string[] = [];
  let current = start;
  const hits: Hit[] = [];
  // CustomEmitter.off can't remove a listener, so the listener switches itself off instead.
  let listening = true;
  const onFrame = ({ message, hex, echo }: BusFrame) => {
    if (!listening || echo || message.src !== DSPC || isKnownDspcFrame(message)) {
      return;
    }
    const hit = {
      index: current,
      hex,
      recentlySent: sent.slice(-3),
      isReset: isResetAnnounce(message),
    };
    hits.push(hit);
    recorder.record('sweepHit', hit);
  };
  bridge.on('frame', onFrame);

  for (let index = start; index < items.length; index++) {
    current = index;
    const hex = frameHex(items[index]);
    sent.push(hex);
    bridge.send(items[index]);
    recorder.record('sweepItem', { index, hex });
    await sleep(options.windowMs);

    if (index % BLOCK_SIZE !== BLOCK_SIZE - 1 && index !== items.length - 1) {
      continue;
    }

    if ((await liveness.check(2)) || (await liveness.wake())) {
      saveCheckpoint(index + 1);
      recorder.print(`sweep ${options.spec}: ${index + 1}/${items.length}, ${hits.length} hits`);
      continue;
    }

    const suspects = sent.slice(-BLOCK_SIZE);
    recorder.record('sweepHang', { index, suspects });
    recorder.print(`DSP-C stopped answering during items ${blockStart(index)}..${index}: ${suspects.join(' | ')}`);
    saveCheckpoint(blockStart(index));

    await ant.set(false);
    await sleep(2000);
    await ant.set(true);
    await sleep(2000);
    if (!(await liveness.wake())) {
      recorder.print(
        'DSP-C still unresponsive after an ANT cycle. Unplug and replug its connector, then rerun with --resume.',
      );
      listening = false;
      return SWEEP_EXIT_HANG;
    }
    recorder.print('DSP-C answering again after an ANT cycle, continuing');
  }

  listening = false;
  fs.rmSync(checkpointFile, { force: true });

  recorder.print(`==== sweep ${options.spec} done: ${hits.length} hits ====`);
  const byHex = Map.groupBy(hits, (hit) => hit.hex);
  byHex.forEach((group, hex) =>
    recorder.print(
      `[${hex}] x${group.length}${group[0].isReset ? ' RESET' : ''} after: ${group
        .slice(0, 5)
        .map((hit) => hit.recentlySent.at(-1))
        .join(' | ')}`,
    ),
  );
  recorder.record('sweepSummary', { spec: options.spec, total: items.length, hits: hits.length });
  return 0;
};

export const describeSweep = (spec: string, sources?: number[]): string => {
  const items = buildSweep(parseSweepSpec(spec, sources));
  return `${items.length} frames, first [${frameHex(items[0])}], last [${frameHex(items.at(-1) as IbusMessage)}], sources ${toHex(
    [...new Set(items.map(({ src }) => src))],
  )}`;
};
