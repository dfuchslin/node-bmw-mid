import * as pigpioClient from 'pigpio-client';
import Logger from '@/lib/log.js';
import { config } from '@/config.js';

const pigpio = pigpioClient.pigpio({ host: config.gpio.host });

const context = 'gpio-bus';
const log = Logger.get(context);
let rpi_gpio: { power: any; light: any };
let isConnected = false;

const init = async () => {
  try {
    // Wait for pigpio connection
    const ready = new Promise((resolve, reject) => {
      pigpio.once('connected', resolve);
      pigpio.once('error', reject);
    });

    await ready;
    isConnected = true;

    // Initialize GPIO pins
    rpi_gpio = {
      power: pigpio.gpio(config.gpio.pins.power),
      light: pigpio.gpio(config.gpio.pins.light),
    };

    // Set pins to output mode
    await rpi_gpio.power.modeSet('output');
    await rpi_gpio.light.modeSet('output');

    log.notice('Initialized GPIO with pigpio-client');
  } catch (err) {
    log.error('Could not initialize GPIO', err);
    isConnected = false;
  }
};

const term = async () => {
  if (isConnected && pigpio) {
    try {
      // Turn off pins before terminating
      if (rpi_gpio?.power) await rpi_gpio.power.write(0);
      if (rpi_gpio?.light) await rpi_gpio.light.write(0);

      pigpio.destroy();
      isConnected = false;
      log.notice('Terminated GPIO connection');
    } catch (err) {
      log.error('Error during GPIO termination', err);
    }
  }
};

const power = {
  on: async () => {
    if (isConnected && rpi_gpio?.power) {
      await rpi_gpio.power.write(1);
    }
  },
  off: async () => {
    if (isConnected && rpi_gpio?.power) {
      await rpi_gpio.power.write(0);
    }
  },
};

const light = {
  on: async () => {
    if (isConnected && rpi_gpio?.light) {
      await rpi_gpio.light.write(1);
    }
  },
  off: async () => {
    if (isConnected && rpi_gpio?.light) {
      await rpi_gpio.light.write(0);
    }
  },
};

export default {
  init,
  term,
  power,
  light,
};
