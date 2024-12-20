import Logger from '@/lib/log';
import api from '@/api';
import gpio from '@/gpio';
import ibus from '@/ibus';
import { GPIO, GPIOState } from '@/types';
import { EventBus } from '@/eventbus';

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

  const eventBus = new EventBus();
  await api.init(eventBus);
  await gpio.init(eventBus);
  await ibus.init(eventBus);

  gpio.emit(GPIO.Power, GPIOState.On, { context });
};

const term = async () => {
  log.notice('Terminating');

  await ibus.term();
  gpio.emit(GPIO.Power, GPIOState.Off, { context });

  await api.term();
  await gpio.term();
  process.exit();
};

(async () => {
  await init();
})();
