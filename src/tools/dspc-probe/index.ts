import { parseArgs } from 'node:util';
import { setTimeout as sleep } from 'node:timers/promises';
import Logger from '../../lib/log.js';
import { probeConfig } from './config.js';
import { runButtons, runMonitor } from './interactive.js';
import { createProbe, Probe } from './probe.js';
import { APP_BOOT_STEPS, resolveScenarios, runScenarios, runStep, SCENARIO_GROUPS, SCENARIOS } from './scenarios.js';
import { describeSweep, runSweep } from './sweep.js';

const context = 'dspc-probe';
const log = Logger.get(context);

const USAGE = `usage: npm run dspc-probe -- <command> [options]

  monitor                         interactive bus console (frames, markers, :ant, :ka, :resp, :check)
  boot                            boot the DSP-C application, then monitor with the emulated amp + car traffic on
  scenario list                   list scenarios and groups
  scenario <name|group> [--repeat N]
  sweep <A|B[:cmds]|C[:cmds]> [--src 68,6A] [--window ms] [--resume] [--dry-run]
  liveness [--count N] [--interval ms]
  buttons <seconds>               timed window for pressing buttons by hand
  ant on|off

  --no-gpio                       don't connect to pigpiod (ANT steps are skipped)`;

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    repeat: { type: 'string', default: '1' },
    src: { type: 'string' },
    window: { type: 'string', default: '150' },
    resume: { type: 'boolean', default: false },
    'dry-run': { type: 'boolean', default: false },
    count: { type: 'string', default: '0' },
    interval: { type: 'string', default: '5000' },
    'no-gpio': { type: 'boolean', default: false },
  },
});

const [command, arg] = positionals;
const sources = values.src?.split(',').map((src) => parseInt(src, 16));

const withProbe = async (name: string, fn: (probe: Probe) => Promise<number | void>): Promise<number> => {
  const probe = await createProbe(name, { gpio: !values['no-gpio'] });
  let stopping = false;
  const stop = async () => {
    if (stopping) {
      return;
    }
    stopping = true;
    await probe.term();
    process.exit(130);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);

  const code = (await fn(probe)) ?? 0;
  probe.recorder.print(`log: ${probe.recorder.file}`);
  await probe.term();
  return code;
};

const main = async (): Promise<number> => {
  switch (command) {
    case 'monitor':
      return withProbe('monitor', runMonitor);

    case 'boot':
      return withProbe('boot', async (probe) => {
        for (const step of APP_BOOT_STEPS) {
          await runStep(probe, step);
        }
        probe.recorder.marker('booted: emulated amp + car traffic running until stdin closes');
        await runMonitor(probe);
      });

    case 'scenario': {
      if (!arg || arg === 'list') {
        SCENARIOS.forEach(({ name, description }) => process.stdout.write(`${name.padEnd(26)} ${description}\n`));
        Object.entries(SCENARIO_GROUPS).forEach(([group, names]) =>
          process.stdout.write(`[group] ${group.padEnd(18)} ${names.join(', ')}\n`),
        );
        return 0;
      }
      const scenarios = resolveScenarios(arg);
      if (!scenarios.length) {
        log.error('Unknown scenario "%s" — see `scenario list`', arg);
        return 1;
      }
      return withProbe(`scenario-${arg}`, async (probe) => {
        await runScenarios(probe, scenarios, Number(values.repeat));
      });
    }

    case 'sweep': {
      if (!arg) {
        break;
      }
      process.stdout.write(`sweep ${arg}: ${describeSweep(arg, sources)}\n`);
      if (values['dry-run']) {
        return 0;
      }
      return withProbe(`sweep-${arg}`, (probe) =>
        runSweep(probe, {
          spec: arg,
          sources,
          windowMs: Number(values.window),
          resume: values.resume,
          logDir: probeConfig.logDir,
        }),
      );
    }

    case 'liveness':
      return withProbe('liveness', async (probe) => {
        const count = Number(values.count);
        for (let i = 0; count === 0 || i < count; i++) {
          const alive = await probe.liveness.check();
          probe.recorder.print(`DSP-C ${alive ? 'answered' : 'did NOT answer'}`);
          await sleep(Number(values.interval));
        }
      });

    case 'buttons':
      return withProbe('buttons', (probe) => runButtons(probe, Number(arg ?? 30)));

    case 'ant':
      if (arg !== 'on' && arg !== 'off') {
        break;
      }
      return withProbe(`ant-${arg}`, (probe) => probe.ant.set(arg === 'on'));

    default:
      break;
  }

  process.stdout.write(`${USAGE}\n`);
  return 1;
};

main().then(
  (code) => process.exit(code),
  (err) => {
    log.error('dspc-probe failed: %s', err?.stack ?? err);
    process.exit(1);
  },
);
