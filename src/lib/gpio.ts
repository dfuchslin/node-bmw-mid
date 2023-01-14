import { Gpio } from 'onoff';
import Logger from '../lib/log';
import { config } from '../config';

const log = Logger.get('gpio');
let rpi_gpio: { power: Gpio; light: Gpio };

// GPIO 14: power + ignition
// GPIO 15: lights

const init = async () => {
  try {
    rpi_gpio = {
      power: new Gpio(config.gpio.pins.power, 'out'),
      light: new Gpio(config.gpio.pins.light, 'out'),
    };
    log.notice('Initialized GPIO');
  } catch (err) {
    log.error('Could not initialize GPIO', err);
  }
};

const term = async () => {
  rpi_gpio?.power.unexport();
  rpi_gpio?.light.unexport();
};

export default {
  init,
  term,
};
