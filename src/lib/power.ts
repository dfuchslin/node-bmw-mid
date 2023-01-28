import gpio from './gpio';
import Logger from '../lib/log';
import { CustomEmitter, PowerEvent, PowerState } from '../types';

class PowerEmitter extends CustomEmitter<{
  [PowerEvent.Power]: PowerState;
  [PowerEvent.Light]: PowerState;
}> {}

const context = 'power';
const log = Logger.get(context);
const powerEmitter = new PowerEmitter({ context });

powerEmitter.on(PowerEvent.Power, async (state) => {
  switch (state) {
    case PowerState.On:
      await gpio.power.on();
      break;

    case PowerState.Off:
      await gpio.light.off();
      await gpio.power.off();
      break;

    case PowerState.Toggle:
    default:
      log.info('event: power toggle');
    // TODO
  }
});

powerEmitter.on(PowerEvent.Light, async (state) => {
  switch (state) {
    case PowerState.On:
      await gpio.light.on();
      break;

    case PowerState.Off:
      await gpio.light.off();
      break;

    case PowerState.Toggle:
    default:
      log.info('event: light toggle');
    // TODO
  }
});

const init = async () => {
  log.notice('Initializing power');
  await gpio.init();
};

const term = async () => {
  log.notice('Shutting down power in 3 seconds');
  await new Promise((resolve) => setTimeout(resolve, 3000));
  await gpio.term();
};

export default {
  init,
  term,
  on: powerEmitter.on.bind(powerEmitter),
  emit: powerEmitter.emit.bind(powerEmitter),
};
