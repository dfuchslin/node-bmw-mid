import env from 'env-var';

export const config = {
  api: {
    port: env.get('API_PORT').default('3000').asInt(),
  },
  gpio: {
    pins: {
      power: env.get('GPIO_PINS_POWER').default('14').asInt(),
      light: env.get('GPIO_PINS_LIGHT').default('15').asInt(),
    },
  },
  ibus: {
    interface: {
      path: env.get('IBUS_INTERFACE_PATH').default('/dev/ttyUSB0').asString(),
    },
  },
};
