import { IbusInterface } from '../lib/ibus';
import Logger from '../lib/log';
import { config } from '../config';

const namespace = 'ibus';
const log = Logger.get(namespace);
const ibusDevice = config.ibus.interface.path;
const ibusInterface = new IbusInterface(ibusDevice);

const init = async () => {
  try {
    await ibusInterface.startup();
    log.notice('Initialized ibus on %s', ibusDevice);
  } catch (err) {
    log.error('Could not initialize ibus on %s', ibusDevice, err);
  }
};

const term = async () => {
  log.notice('Shutting down ibus');
  await ibusInterface.shutdown();
};

export default {
  init,
  term,
};
