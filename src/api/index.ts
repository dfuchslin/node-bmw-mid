import Koa from 'koa';
import Router from 'koa-router';
import json from 'koa-json';
import Logger from '../lib/log';
import { Globals } from '../types';
import { config } from '../config';

const log = Logger.get('api');
const app = new Koa();
const router = new Router();
let globals: Globals;

const init = async (g: Globals) => {
  globals = g;
  router.get('/', async (ctx, next) => {
    ctx.body = globals;
    await next();
  });

  app.use(json());

  app.use(router.routes()).use(router.allowedMethods());

  const port = config.api.port;
  app.listen(port, () => {
    log.notice(`API server started on port ${port}`);
  });
};

const term = async () => {
  // TODO shut down koa
  log.notice('Shutting down API server');
};

export default {
  init,
  term,
};
