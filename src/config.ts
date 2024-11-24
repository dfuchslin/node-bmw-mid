import env from 'env-var';

// find rpi gpio mapping thusly: `cat /sys/kernel/debug/gpio`
const GPIOMapping = {
  GPIO_14: 526,
  GPIO_15: 527,
}

export const config = {
  api: {
    port: env.get('API_PORT').default('3000').asInt(),
  },
  gpio: {
    pins: {
      power: env.get('GPIO_PINS_POWER').default(GPIOMapping.GPIO_14).asInt(),
      light: env.get('GPIO_PINS_LIGHT').default(GPIOMapping.GPIO_15).asInt(),

    },
  },
  ibus: {
    interface: {
      path: env.get('IBUS_INTERFACE_PATH').default('/dev/ttyUSB0').asString(),
    },
  },
};
