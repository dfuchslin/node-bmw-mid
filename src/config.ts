import dotenv from 'dotenv';
import { z } from 'zod';

const configSchema = z
  .object({
    API_PORT: z.coerce.number().prefault(3000),
    // LOG_LEVEL: z
    //   .enum(Object.keys(LogLevel) as [keyof typeof LogLevel])
    //   .default('INFO')
    //   .transform((val) => LogLevel[val]),
    GPIO_HOST: z.string().prefault('localhost'),
    GPIO_PINS_POWER: z.coerce.number().prefault(14),
    GPIO_PINS_LIGHT: z.coerce.number().prefault(15),
    IBUS_INTERFACE_PATH: z.string().prefault('/dev/ttyUSB0'),
  })
  .transform((val) => ({
    api: {
      port: val.API_PORT,
    },
    gpio: {
      host: val.GPIO_HOST,
      pins: {
        power: val.GPIO_PINS_POWER,
        light: val.GPIO_PINS_LIGHT,
      },
    },
    ibus: {
      interface: {
        path: val.IBUS_INTERFACE_PATH,
      },
    },
  }));

dotenv.config();
export const config = configSchema.parse(process.env);
