import Koa from 'koa';
import bodyParser from 'koa-bodyparser';
import json from 'koa-json';
import Logger from '@/lib/log';
import { config } from '@/config';
import router from '@/api/routes';
import { EventBus } from '@/eventbus';

const namespace = 'api';
const log = Logger.get(namespace);
const app = new Koa();

const init = async (eventBus: EventBus) => {
  const port = config.api.port;

  app.use(bodyParser());
  app.use(json());
  app.use(router.routes()).use(router.allowedMethods());

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
