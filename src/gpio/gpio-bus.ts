import { Gpio } from 'onoff';
import Logger from '@/lib/log';
import { config } from '@/config';

const context = 'gpio-bus';
const log = Logger.get(context);
let rpi_gpio: { power: Gpio; light: Gpio };

const init = async () => {
  try {
    rpi_gpio = {
      power: new Gpio(config.gpio.pins.power, 'out'),
      light: new Gpio(config.gpio.pins.light, 'out'),
    };
    rpi_gpio.power.setActiveLow(false);
    rpi_gpio.light.setActiveLow(false);
    log.notice('Initialized GPIO');
  } catch (err) {
    log.error('Could not initialize GPIO', err);
  }
};

const term = async () => {
  rpi_gpio?.power.unexport();
  rpi_gpio?.light.unexport();
};

const power = {
  on: async () => {
    rpi_gpio?.power.write(Gpio.HIGH);
  },
  off: async () => rpi_gpio?.power.write(Gpio.LOW),
};

const light = {
  on: async () => rpi_gpio?.light.write(Gpio.HIGH),
  off: async () => rpi_gpio?.light.write(Gpio.LOW),
};

export default {
  init,
  term,
  power,
  light,
};
