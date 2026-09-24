import { IbusInterface } from './lib/ibus/index.js';
import { config } from './config.js';
import Logger from './lib/log.js';
import { FullIbusMessage } from './types/index.js';

const context = 'ibus-monitor';
const log = Logger.get(context);
const ibusTransceiverPath = config.ibus.interface.path;
const ibusInterface = new IbusInterface(ibusTransceiverPath);

const logMessage = (message: FullIbusMessage) => {
  log.notice(
    'src:0x%s dst:0x%s msg:%O [%s]',
    message.src.toString(16),
    message.dst.toString(16),
    message.msg,
    message.msg.toString('ascii'),
  );
};

const term = () => {
  log.notice('Shutting down ibus monitor');
  ibusInterface.shutdown(() => process.exit());
};

process.on('SIGTERM', term);
process.on('SIGINT', term);

log.notice('Starting ibus monitor on %s', ibusTransceiverPath);
ibusInterface.on('data', logMessage, { context });
ibusInterface.startup();
