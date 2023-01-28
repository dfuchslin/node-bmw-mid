import Logger from './lib/log';
import api from './api';
import power from './lib/power';
import ibus from './ibus';
import { PowerEvent, PowerState } from './types';

const context = 'main';
const log = Logger.get(context);

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
  await ibus.init();

  power.emit(PowerEvent.Power, PowerState.On, { context });
};

const term = async () => {
  log.notice('Terminating');

  await ibus.term();
  power.emit(PowerEvent.Power, PowerState.Off, { context });

  await api.term();
  await power.term();
  process.exit();
};

(async () => {
  await init();
})();
