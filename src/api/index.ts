import Logger from '../lib/log.js';
import { config } from '../config.js';
import routes from './routes.js';
import { EventBus } from '../eventbus/index.js';
import { Hono } from 'hono';
import { serve, type ServerType } from '@hono/node-server';
import { logger as honoLogger } from 'hono/logger';
import { compress } from 'hono/compress';

const namespace = 'api';
const log = Logger.get(namespace);
const app = new Hono();

let server: ServerType | null;

const init = async (eventBus: EventBus) => {
  app.use(compress());
  app.use(honoLogger());

  app.route('/', routes);

  server = serve(
    {
      fetch: app.fetch,
      port: config.api.port,
    },
    (info) => {
      log.notice(`API server started on port ${info.port}`);
    },
  );
};

const term = async () => {
  log.notice('Shutting down API server');
  if (server) {
    server.close();
    server = null;
    log.notice('API server shut down');
  }
};

export default {
  init,
  term,
};
