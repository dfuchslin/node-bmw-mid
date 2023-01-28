import gpio from './gpio-bus';
import Logger from '../lib/log';
import { CustomEmitter, GPIO, GPIOState } from '../types';

class GPIOEmitter extends CustomEmitter<{
  [GPIO.Power]: GPIOState;
  [GPIO.Light]: GPIOState;
}> {}

const context = 'gpio';
const log = Logger.get(context);
const gpioEmitter = new GPIOEmitter({ context });

gpioEmitter.on(GPIO.Power, async (state) => {
  switch (state) {
    case GPIOState.On:
      await gpio.power.on();
      break;

    case GPIOState.Off:
      await gpio.light.off();
      await gpio.power.off();
      break;

    case GPIOState.Toggle:
    default:
      log.info('event: power toggle');
    // TODO
  }
});

gpioEmitter.on(GPIO.Light, async (state) => {
  switch (state) {
    case GPIOState.On:
      await gpio.light.on();
      break;

    case GPIOState.Off:
      await gpio.light.off();
      break;

    case GPIOState.Toggle:
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
  on: gpioEmitter.on.bind(gpioEmitter),
  emit: gpioEmitter.emit.bind(gpioEmitter),
};
