import { setTimeout as sleep } from 'node:timers/promises';
import { IbusMessage } from '../../types/index.js';
import { parseFrame } from '../frames.js';
import { CAR_KEEP_ALIVE, KeepAliveName } from './keepalive.js';
import { Probe } from './probe.js';
import { formatSummary, RunSummary } from './recorder.js';

export type Step =
  | { do: 'ant'; on: boolean }
  | { do: 'wait'; ms: number }
  | { do: 'send'; frames: string[]; gapMs?: number }
  | { do: 'keepAlive'; names: KeepAliveName[] }
  | { do: 'responders'; on: boolean }
  | { do: 'check' }
  | { do: 'wake' }
  | { do: 'marker'; text: string };

export type Scenario = { name: string; description: string; steps: Step[] };

// Frames from the real E38 capture (DEBUG-DSPC.md), sent as the radio switches on and drives ANT.
const RADIO_ON = [
  '68 04 FF 02 00 91',
  '68 04 FF 36 AF 0A',
  '68 04 FF 36 31 94',
  '68 04 FF 36 6A CF',
  '68 04 FF 36 C0 65',
  '68 04 FF 36 80 25',
  '68 04 FF 36 50 F5',
  '68 04 FF 36 E2 47',
  '68 04 FF 36 A0 05',
  '68 04 6A 32 21 15',
  '68 04 6A 32 20 14',
];
const AMP_ANNOUNCE = ['6A 04 FF 02 01 92'];
const IGNITION = ['80 04 BF 11 03 29', '80 05 BF 18 00 00 22', 'D0 07 BF 5B 00 00 00 00 33', 'D0 05 BF 5C FF 00 C9'];

const POST_ANT_DELAYS_MS = [0, 50, 200, 1000];

const coldStart: Step[] = [
  { do: 'keepAlive', names: [] },
  { do: 'responders', on: false },
  { do: 'ant', on: false },
  { do: 'wait', ms: 3000 },
];

// After the trigger: watch unprompted for a while (the real DSP-C announces by itself), then poll. A
// poll answered before the ident means the trigger changed something; the ident afterwards is a health check.
const observe = (quietMs = 8000): Step[] => [
  { do: 'wait', ms: quietMs },
  { do: 'check' },
  { do: 'marker', text: 'ident' },
  { do: 'wake' },
  { do: 'wait', ms: 2000 },
  { do: 'check' },
];

const sequencingScenarios = (): Scenario[] => [
  {
    name: 'seq-quiet',
    description: 'ANT on with a silent bus, then observe',
    steps: [...coldStart, { do: 'ant', on: true }, ...observe()],
  },
  {
    name: 'seq-ignition-first',
    description: 'IKE ignition/speed + LCM lights/dimmer running for 3s before ANT on (car order)',
    steps: [
      ...coldStart,
      { do: 'send', frames: IGNITION },
      { do: 'keepAlive', names: ['ike-speed', 'ike-ignition', 'lcm-lights', 'lcm-dimmer'] },
      { do: 'wait', ms: 3000 },
      { do: 'ant', on: true },
      ...observe(),
    ],
  },
  {
    name: 'seq-dimmer',
    description: 'LCM instrument backlight (5C) only, before and after ANT on — LCD backlight trigger?',
    steps: [
      ...coldStart,
      { do: 'keepAlive', names: ['lcm-dimmer'] },
      { do: 'wait', ms: 1000 },
      { do: 'ant', on: true },
      { do: 'send', frames: ['D0 05 BF 5C FF 00 C9'] },
      ...observe(),
    ],
  },
  ...POST_ANT_DELAYS_MS.flatMap((delay): Scenario[] => [
    {
      name: `seq-amp-announce@${delay}`,
      description: `amp "ready after reset" ${delay}ms after ANT on`,
      steps: [
        ...coldStart,
        { do: 'ant', on: true },
        { do: 'wait', ms: delay },
        { do: 'send', frames: AMP_ANNOUNCE },
        ...observe(),
      ],
    },
    {
      name: `seq-radio-on@${delay}`,
      description: `radio-on block (68 → FF 36 xx, 68 → 6A 32 xx) ${delay}ms after ANT on`,
      steps: [
        ...coldStart,
        { do: 'ant', on: true },
        { do: 'wait', ms: delay },
        { do: 'send', frames: RADIO_ON },
        ...observe(),
      ],
    },
    {
      name: `seq-full-car@${delay}`,
      description: `car keep-alive + responders, ANT on, amp announce + radio-on block ${delay}ms later`,
      steps: [
        ...coldStart,
        { do: 'responders', on: true },
        { do: 'send', frames: IGNITION },
        { do: 'keepAlive', names: CAR_KEEP_ALIVE.filter((name) => name !== 'poll-dspc') },
        { do: 'wait', ms: 3000 },
        { do: 'ant', on: true },
        { do: 'wait', ms: delay },
        { do: 'send', frames: [...AMP_ANNOUNCE, ...RADIO_ON] },
        ...observe(),
      ],
    },
  ]),
];

const baselineScenarios = (): Scenario[] => [
  {
    name: 'polls-only',
    description: 'ANT on, then a poll every 2s for 20s — no diagnostic 3F frames at all',
    steps: [
      ...coldStart,
      { do: 'ant', on: true },
      ...Array.from({ length: 10 }, (): Step[] => [{ do: 'check' }, { do: 'wait', ms: 2000 }]).flat(),
    ],
  },
  {
    name: 'ident-first',
    description: 'ANT on, diagnostic ident (3F → EA 00) first, then polls — compare with polls-only',
    steps: [
      ...coldStart,
      { do: 'ant', on: true },
      { do: 'wait', ms: 500 },
      { do: 'send', frames: ['3F 03 EA 00 D6'] },
      ...Array.from({ length: 5 }, (): Step[] => [{ do: 'wait', ms: 2000 }, { do: 'check' }]).flat(),
    ],
  },
  ...[3, 5, 10, 15, 20, 30].map((seconds): Scenario => ({
    name: `sleep-after@${seconds}s`,
    description: `ANT on, ident + poll, then ${seconds}s of silence — still answering polls?`,
    steps: [
      ...coldStart,
      { do: 'ant', on: true },
      { do: 'wait', ms: 1000 },
      { do: 'wake' },
      { do: 'wait', ms: seconds * 1000 },
      { do: 'check' },
    ],
  })),
];

// Boots the DSP-C application the way seq-full-car does (confirmed on the bench), then keeps the car
// traffic running so buttons can be pressed and the LCD watched.
const HOLD_SECONDS = 60;

// Leaves responders (the emulated amp) and the car keep-alive running, so the DSP-C stays usable.
export const APP_BOOT_STEPS: Step[] = [
  ...coldStart,
  { do: 'responders', on: true },
  { do: 'send', frames: IGNITION },
  { do: 'keepAlive', names: CAR_KEEP_ALIVE.filter((name) => name !== 'poll-dspc') },
  { do: 'wait', ms: 3000 },
  { do: 'ant', on: true },
  { do: 'wait', ms: 200 },
  { do: 'send', frames: [...AMP_ANNOUNCE, ...RADIO_ON] },
  { do: 'wait', ms: 2000 },
  { do: 'keepAlive', names: CAR_KEEP_ALIVE },
];

const applicationScenarios = (): Scenario[] => [
  {
    name: 'app-hold',
    description: `boot the application (full car @200ms), then hold it for ${HOLD_SECONDS}s for button presses`,
    steps: [
      ...APP_BOOT_STEPS,
      { do: 'marker', text: 'buttons: press now' },
      ...Array.from({ length: HOLD_SECONDS / 5 }, (_, i): Step[] => [
        { do: 'wait', ms: 5000 },
        { do: 'marker', text: `buttons: T+${(i + 1) * 5}s` },
      ]).flat(),
    ],
  },
];

export const SCENARIOS: Scenario[] = [...baselineScenarios(), ...sequencingScenarios(), ...applicationScenarios()];

// Scenario groups that can be run in one go with `scenario <group>`.
export const SCENARIO_GROUPS: Record<string, string[]> = {
  baseline: ['polls-only', 'ident-first'],
  'sleep-timer': SCENARIOS.filter(({ name }) => name.startsWith('sleep-after@')).map(({ name }) => name),
  matrix: SCENARIOS.filter(({ name }) => name.startsWith('seq-')).map(({ name }) => name),
};

export const resolveScenarios = (name: string): Scenario[] => {
  const names = SCENARIO_GROUPS[name] ?? [name];
  return names
    .map((scenarioName) => SCENARIOS.find((scenario) => scenario.name === scenarioName))
    .filter((scenario): scenario is Scenario => scenario !== undefined);
};

export const runStep = async (probe: Probe, step: Step): Promise<void> => {
  switch (step.do) {
    case 'ant':
      return probe.ant.set(step.on);

    case 'wait':
      await sleep(step.ms);
      return;

    case 'send':
      for (const frame of step.frames) {
        probe.bridge.send(parseFrame(frame).message as IbusMessage);
        if (step.gapMs) {
          await sleep(step.gapMs);
        }
      }
      return;

    case 'keepAlive':
      return probe.keepAlive.set(step.names);

    case 'responders':
      return probe.responders.set(step.on);

    case 'check':
      await probe.liveness.check();
      return;

    case 'wake':
      await probe.liveness.wake();
      return;

    case 'marker':
      return probe.recorder.marker(step.text);

    default:
      throw new Error(`unknown step ${JSON.stringify(step)}`);
  }
};

export const runScenarios = async (probe: Probe, scenarios: Scenario[], repeat: number): Promise<RunSummary[]> => {
  const summaries: RunSummary[] = [];
  for (const scenario of scenarios) {
    for (let run = 1; run <= repeat; run++) {
      probe.recorder.beginRun(`${scenario.name}#${run}`);
      probe.recorder.print(scenario.description);
      for (const step of scenario.steps) {
        await runStep(probe, step);
      }
      const summary = probe.recorder.endRun();
      if (summary) {
        summaries.push(summary);
      }
    }
  }
  probe.keepAlive.stop();

  probe.recorder.print('==== summary ====');
  summaries.forEach((summary) => probe.recorder.print(formatSummary(summary)));
  return summaries;
};
