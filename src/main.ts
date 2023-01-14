import Logger from './lib/log';
import api from './api';
import gpio from './lib/gpio';
import { Globals } from './types';

const log = Logger.get('main');

const globals: Globals = {
  state: { disconnected: false },
};

const init_signal_listeners = async () => {
  process.on('SIGTERM', async () => {
    log.warn('Caught SIGTERM');
    await term();
  });

  process.on('SIGINT', async () => {
    log.warn('Caught SIGINT');
    await term();
  });

  process.on('exit', () => {
    log.warn('Exiting');
  });
};

const init = async () => {
  log.notice('Initializing');

  await init_signal_listeners();
  await api.init(globals);
  await gpio.init();
};

const term = async () => {
  log.notice('Terminating');

  await api.term();
  await gpio.term();
  process.exit();
};

(async () => {
  await init();
})();
