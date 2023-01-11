import api from './api';
import api2 from './api2';
import gpio from './lib/gpio';
import { Globals } from './types';

const globals: Globals = {
  state: { disconnected: false },
};

const init_signal_listeners = async () => {
  process.on('SIGTERM', async () => {
    console.log('Caught SIGTERM');
    await term();
  });

  process.on('SIGINT', async () => {
    console.log('Caught SIGINT');
    await term();
  });

  process.on('exit', () => {
    console.log('Exiting');
  });
};

const init = async () => {
  console.log('Initializing');

  await init_signal_listeners();
  await api.init(globals);
  await api2.init(globals);
  await gpio.init(globals);
};

const term = async () => {
  console.log('Terminating');

  await api.term();
  await gpio.term();
  process.exit();
};

(async () => {
  await init();
})();
