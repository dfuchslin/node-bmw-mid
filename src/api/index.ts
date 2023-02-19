import Koa from 'koa';
import bodyParser from 'koa-bodyparser';
import json from 'koa-json';
import Logger from '../lib/log';
import { config } from '../config';
import router from './routes';

const namespace = 'api';
const log = Logger.get(namespace);
const app = new Koa();
const port = config.api.port;
app.use(bodyParser());
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
