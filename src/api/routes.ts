import Router from 'koa-router';
import Logger from '../lib/log';
import power from '../lib/power';
import { PowerState } from '../types';

const namespace = 'api';
const log = Logger.get(namespace);
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
          power.emit(namespace, 'power', PowerState.On);
          break;
        case 'off':
          power.emit(namespace, 'power', PowerState.Off);
          break;
        default:
          break;
      }
      break;

    case 'light':
      switch (ctx.params.state) {
        case 'on':
          power.emit(namespace, 'light', PowerState.On);
          break;
        case 'off':
          power.emit(namespace, 'light', PowerState.Off);
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
