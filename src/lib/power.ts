import gpio from './gpio';
import Logger from '../lib/log';
import { CustomEmitter, PowerState } from '../types';

class PowerEmitter extends CustomEmitter<{ power: PowerState; light: PowerState }> {}

const log = Logger.get('power');
const powerEmitter = new PowerEmitter('power');

powerEmitter.on('power', async (state) => {
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

powerEmitter.on('light', async (state) => {
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
  log.notice('Shutting down power');
  await gpio.term();
};

export default {
  init,
  term,
  on: powerEmitter.on.bind(powerEmitter),
  emit: powerEmitter.emit.bind(powerEmitter),
};
