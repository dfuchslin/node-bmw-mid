import gpio from './gpio-bus.js';
import Logger from '../lib/log.js';
import { CustomEmitter, GPIO, GPIOState } from '../types/index.js';
import { EventBus } from '../eventbus/index.js';

class GPIOEmitter extends CustomEmitter<{
  [GPIO.Power]: GPIOState;
  [GPIO.Light]: GPIOState;
}> {}

const context = 'gpio';
const log = Logger.get(context);
const gpioEmitter = new GPIOEmitter({ context });

let sharedEventBus: EventBus | undefined;

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
      // Main power to the MID should never be toggled off by this path — power is
      // meant to stay on always; the knob's power button toggles the light instead.
      log.warn('event: power toggle requested — ignored, power is never toggled off');
  }
});

gpioEmitter.on(GPIO.Light, async (state) => {
  let resultingState: GPIOState.On | GPIOState.Off;

  switch (state) {
    case GPIOState.On:
      await gpio.light.on();
      resultingState = GPIOState.On;
      break;

    case GPIOState.Off:
      await gpio.light.off();
      resultingState = GPIOState.Off;
      break;

    case GPIOState.Toggle: {
      const level = await gpio.light.read();
      if (level === undefined) {
        log.warn('Cannot toggle light: GPIO not connected');
        return;
      }
      if (level) {
        await gpio.light.off();
        resultingState = GPIOState.Off;
      } else {
        await gpio.light.on();
        resultingState = GPIOState.On;
      }
      break;
    }

    default:
      log.info('event: light toggle');
      return;
  }

  // Broadcast the resolved on/off state (never Toggle) so other modules — e.g. the
  // IBUS display layer — can suspend/resume rendering in step with the backlight.
  sharedEventBus?.emit(GPIO.Light, resultingState, { context });
});

const init = async (eventBus: EventBus) => {
  log.notice('Initializing power');
  sharedEventBus = eventBus;
  await gpio.init();
};

const term = async () => {
  log.notice('Shutting down power in 3 seconds');
  await new Promise((resolve) => setTimeout(resolve, 3000));
  await gpio.term();
};

// Reads the light pin's actual current hardware level — for callers that need to sync
// their own state with reality at startup, rather than assuming an initial value.
const isLightOn = async (): Promise<boolean | undefined> => {
  const level = await gpio.light.read();
  return level === undefined ? undefined : Boolean(level);
};

export default {
  init,
  term,
  on: gpioEmitter.on.bind(gpioEmitter),
  emit: gpioEmitter.emit.bind(gpioEmitter),
  isLightOn,
};
