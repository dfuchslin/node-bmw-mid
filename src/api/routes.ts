import Router from 'koa-router';
import Logger from '@/lib/log';
import gpio from '@/gpio';
import { GPIO, GPIOState } from '@/types';
import ibus from '@/ibus';

const context = 'api';
const log = Logger.get(context);
const router = new Router();

router.get('/', async (ctx, next) => {
  log.info('/');
  ctx.body = 'hello world';
  await next();
});

router.post('/power/:name/:state', async (ctx, next) => {
  switch (ctx.params.name) {
    case 'power':
      switch (ctx.params.state) {
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
      switch (ctx.params.state) {
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
  ctx.body = 'updated';
  await next();
});

router.post('/ibus/message', async (ctx, next) => {
  const msg = (ctx.request.body as any).split(',').map((h: string) => parseInt(h, 16));
  ibus.sendMessage(msg[0], msg[1], msg.slice(2));
  ctx.body = `Sent message: ${msg}`;
  await next();
});

export default router;
