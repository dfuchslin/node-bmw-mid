import readline from 'node:readline';
import { setTimeout as sleep } from 'node:timers/promises';
import { IbusDeviceId } from '../../types/index.js';
import { parseFrame } from '../frames.js';
import { BusFrame } from './bridge-client.js';
import { KEEP_ALIVE_NAMES, KeepAliveName } from './keepalive.js';
import { Probe } from './probe.js';

const MONITOR_HELP = [
  'Type a frame to send it:  80 04 BF 11 01 2B   (full frame, LEN/CHK verified)',
  '                          !80 BF 11 01        (LEN/CHK computed)',
  '# some note               write a marker into the log',
  ':ant on|off               switch ANT',
  ':check                    poll the DSP-C',
  `:ka <names>|off           keep-alive set: ${KEEP_ALIVE_NAMES.join(', ')}`,
  ':resp on|off              auto-responders',
];

const handleCommand = async (probe: Probe, line: string): Promise<void> => {
  const [command, arg = ''] = line.slice(1).trim().split(/\s+/, 2);
  switch (command) {
    case 'ant':
      return probe.ant.set(arg === 'on');

    case 'check':
      probe.recorder.print(`DSP-C ${(await probe.liveness.check()) ? 'answered' : 'did NOT answer'}`);
      return;

    case 'ka': {
      const names = arg === 'off' ? [] : (arg.split(',').filter(Boolean) as KeepAliveName[]);
      const unknown = names.filter((name) => !KEEP_ALIVE_NAMES.includes(name));
      if (unknown.length) {
        probe.recorder.print(`unknown keep-alive entries: ${unknown.join(', ')}`);
        return;
      }
      return probe.keepAlive.set(names);
    }

    case 'resp':
      return probe.responders.set(arg === 'on');

    default:
      MONITOR_HELP.forEach((help) => probe.recorder.print(help));
  }
};

// Interactive console: everything on the bus is printed and logged; stdin sends frames and markers.
export const runMonitor = (probe: Probe): Promise<void> => {
  MONITOR_HELP.forEach((help) => probe.recorder.print(help));
  return new Promise((resolve) => {
    const input = readline.createInterface({ input: process.stdin });
    input.on('close', resolve);
    input.on('line', async (raw) => {
      const line = raw.trim();
      if (!line) {
        return;
      }
      if (line.startsWith('#')) {
        probe.recorder.marker(line.slice(1).trim());
        return;
      }
      if (line.startsWith(':')) {
        await handleCommand(probe, line);
        return;
      }
      const parsed = parseFrame(line);
      if (!parsed.message) {
        probe.recorder.print(`!! ${parsed.error}`);
        return;
      }
      probe.bridge.send(parsed.message);
    });
  });
};

// A timed window for pressing buttons by hand. The DSP-C is kept awake with polls, and timestamped
// markers every few seconds make it easy to line presses up with the log afterwards.
export const runButtons = async (probe: Probe, seconds: number): Promise<void> => {
  const frames: BusFrame[] = [];
  let listening = true;
  probe.bridge.on('frame', (frame) => {
    if (listening && !frame.echo) {
      frames.push(frame);
    }
  });

  probe.keepAlive.set(['poll-dspc']);
  probe.recorder.marker(`buttons: press now, window ${seconds}s`);
  for (let elapsed = 5; elapsed <= seconds; elapsed += 5) {
    await sleep(5000);
    probe.recorder.marker(`buttons: T+${elapsed}s`);
  }
  listening = false;
  probe.keepAlive.stop();

  probe.recorder.print('==== frames received during the window (excluding poll replies) ====');
  const interesting = frames.filter(({ message }) => !(message.src === IbusDeviceId.DSPC && message.msg[0] === 0x02));
  const counts = Map.groupBy(interesting, ({ hex }) => hex);
  if (!counts.size) {
    probe.recorder.print('nothing');
  }
  counts.forEach((group, hex) => probe.recorder.print(`[${hex}] x${group.length}`));
};
