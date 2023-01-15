import Koa from 'koa';
import json from 'koa-json';
import Logger from '../lib/log';
import { config } from '../config';
import router from './routes';

const log = Logger.get('api');
const app = new Koa();
const port = config.api.port;
app.use(json());
app.use(router.routes()).use(router.allowedMethods());

const init = async () => {
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
