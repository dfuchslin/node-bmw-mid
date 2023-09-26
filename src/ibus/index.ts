import { IbusInterface } from '@/lib/ibus';
import Logger from '@/lib/log';
import { config } from '@/config';
import router from '@/ibus/router';
import { buildMessage } from '@/ibus/message';
import { EventBus } from '@/eventbus';

const namespace = 'ibus';
const log = Logger.get(namespace);
const ibusTransceiverPath = config.ibus.interface.path;
const ibusInterface = new IbusInterface(ibusTransceiverPath);

const init = async (eventBus: EventBus) => {
  try {
    ibusInterface.startup();
    await router.init({ eventBus, ibusInterface });
    log.notice('Initialized ibus on %s', ibusTransceiverPath);
  } catch (err) {
    log.error('Could not initialize ibus on %s', ibusTransceiverPath, err);
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
