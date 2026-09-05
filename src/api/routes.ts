import Logger from '../lib/log.js';
import gpio from '../gpio/index.js';
import { DisplayEvent, GPIO, GPIOState } from '../types/index.js';
import ibus from '../ibus/index.js';
import { EventBus } from '../eventbus/index.js';
import { Hono } from 'hono';

const context = 'api';
const log = Logger.get(context);
const router = new Hono();

let sharedEventBus: EventBus | undefined;

export const setEventBus = (eventBus: EventBus): void => {
  sharedEventBus = eventBus;
};

router.get('/', (c) => {
  log.info('/');
  return c.text('hello world');
});

router.post('/power/:name/:state', (c) => {
  const { name, state } = c.req.param();
  switch (name) {
    case 'power':
      switch (state) {
        case 'on':
          gpio.emit(GPIO.Power, GPIOState.On, { context });
          break;
        case 'off':
          gpio.emit(GPIO.Power, GPIOState.Off, { context });
          break;
        default:
          break;
      }
      break;

    case 'light':
      switch (state) {
        case 'on':
          gpio.emit(GPIO.Light, GPIOState.On, { context });
          break;
        case 'off':
          gpio.emit(GPIO.Light, GPIOState.Off, { context });
          break;
        default:
          break;
      }
      break;

    default:
      break;
  }
  return c.text('updated');
});

router.post('/pixeltest/:state', (c) => {
  const { state } = c.req.param();
  switch (state) {
    case 'on':
      sharedEventBus?.emit(DisplayEvent.PixelTestToggled, { enabled: true }, { context });
      break;
    case 'off':
      sharedEventBus?.emit(DisplayEvent.PixelTestToggled, { enabled: false }, { context });
      break;
    default:
      break;
  }
  return c.text('updated');
});

router.post('/ibus/message', async (c) => {
  const body = await c.req.text();
  const msg = body.split(',').map((h: string) => parseInt(h, 16));
  ibus.sendMessage(msg[0], msg[1], msg.slice(2));
  return c.text(`Sent message: ${msg}`);
});

export default router;
