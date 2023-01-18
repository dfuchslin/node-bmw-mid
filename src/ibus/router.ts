import Logger from '../lib/log';
import { IbusInterface } from '../lib/ibus';
import { FullIbusMessage } from '../types/ibus';

const namespace = 'ibus-router';
const log = Logger.get(namespace);

const init = async (ibusInterface: IbusInterface) => {
  ibusInterface.on(namespace, 'data', (message) => {
    log.error('message received');
  });
  log.notice('Initialized ibus message router');
};

const routeMessage = (message: FullIbusMessage) => {
  // todo
};

const term = async () => {
  //
};

export default {
  init,
  term,
};
