import dotenv from 'dotenv';
import { z } from 'zod';

// The probe runs on a workstation and reaches the Pi over the network: the I-Bus through ibus-bridge,
// and GPIO through pigpiod. It deliberately doesn't use src/config.ts, which requires the Roon settings.
const probeConfigSchema = z
  .object({
    PROBE_BRIDGE_HOST: z.string().prefault('rpi-bmwmid'),
    PROBE_BRIDGE_PORT: z.coerce.number().prefault(7700),
    PROBE_LOG_DIR: z.string().prefault('./probe-logs'),
    GPIO_HOST: z.string().prefault('rpi-bmwmid'),
    GPIO_PINS_POWER: z.coerce.number().prefault(14),
    PROBE_GPIO_PIN_ANT: z.coerce.number().prefault(15),
  })
  .transform((val) => ({
    bridge: { host: val.PROBE_BRIDGE_HOST, port: val.PROBE_BRIDGE_PORT },
    logDir: val.PROBE_LOG_DIR,
    gpio: { host: val.GPIO_HOST, pins: { power: val.GPIO_PINS_POWER, ant: val.PROBE_GPIO_PIN_ANT } },
  }));

dotenv.config({ quiet: true });
export const probeConfig = probeConfigSchema.parse(process.env);
