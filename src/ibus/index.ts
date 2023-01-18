import { IbusInterface } from '../lib/ibus';
import Logger from '../lib/log';
import { config } from '../config';
import router from './router';

const namespace = 'ibus';
const log = Logger.get(namespace);
const ibusDevice = config.ibus.interface.path;
const ibusInterface = new IbusInterface(ibusDevice);

const init = async () => {
  try {
    ibusInterface.startup();
    await router.init(ibusInterface);
    log.notice('Initialized ibus on %s', ibusDevice);
  } catch (err) {
    log.error('Could not initialize ibus on %s', ibusDevice, err);
  }
};

const term = async () => {
  log.notice('Shutting down ibus');
  ibusInterface.shutdown();
  await router.term();
};

export default {
  init,
  term,
};
