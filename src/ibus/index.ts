import { IbusBridgeClient, IbusInterface, IbusTransport } from '../lib/ibus/index.js';
import Logger from '../lib/log.js';
import { config } from '../config.js';
import router from './router.js';
import { buildMessage } from './message.js';
import { EventBus } from '../eventbus/index.js';

const namespace = 'ibus';
const log = Logger.get(namespace);
const { host: bridgeHost, port: bridgePort } = config.ibus.bridge;
const transportName = bridgeHost ? `ibus-bridge ${bridgeHost}:${bridgePort}` : config.ibus.interface.path;
const ibusInterface: IbusTransport = bridgeHost
  ? new IbusBridgeClient(bridgeHost, bridgePort)
  : new IbusInterface(config.ibus.interface.path);

const init = async (eventBus: EventBus) => {
  try {
    ibusInterface.startup();
    await router.init({ eventBus, ibusInterface });
    log.notice('Initialized ibus on %s', transportName);
  } catch (err) {
    log.error('Could not initialize ibus on %s', transportName, err);
  }
};

const term = async () => {
  log.notice('Shutting down ibus');
  ibusInterface.shutdown();
  await router.term();
};

const sendMessage = (src: number, dest: number, msg: number[]) => {
  ibusInterface.sendMessage(buildMessage(src, dest, Buffer.from(msg)));
};

export default {
  init,
  term,
  sendMessage,
};
