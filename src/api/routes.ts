import Router from 'koa-router';
import Logger from '../lib/log';
import gpio from '../gpio';
import { GPIO, GPIOState } from '../types';

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

export default router;
