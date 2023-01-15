import Logger from './lib/log';
import api from './api';
import power from './lib/power';
import { PowerState } from './types';

const namespace = 'main';
const log = Logger.get(namespace);

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
  await api.init();
  await power.init();

  power.emit(namespace, 'power', PowerState.On);
};

const term = async () => {
  log.notice('Terminating');

  power.emit(namespace, 'power', PowerState.Off);
  await api.term();
  await power.term();
  process.exit();
};

(async () => {
  await init();
})();
