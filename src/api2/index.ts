import Koa from 'koa';
import Router from 'koa-router';
import json from 'koa-json';
import { Globals } from '../types';

const app = new Koa();
const router = new Router();
let globals: Globals;

const init = async (g: Globals) => {
  globals = g;

  router.get('/', async (ctx, next) => {
    ctx.body = globals;
    await next();
  });

  router.post('/', async (ctx, next) => {
    globals.state.disconnected = ctx.query['disconnected'] === 'true';
    ctx.body = globals;
    await next();
  });

  app.use(json());

  app.use(router.routes()).use(router.allowedMethods());

  const port = 3001;
  app.listen(port, () => {
    console.log(`API server started on port ${port}`);
  });
};

const term = async () => {
  // TODO shut down koa
  console.log('Shutting down API server');
};

export default {
  init,
  term,
};
