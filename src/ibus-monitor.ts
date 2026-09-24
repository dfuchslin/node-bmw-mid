import readline from 'node:readline';
import { IbusInterface } from './lib/ibus/index.js';
import { createBufferFromIbusMessage } from './lib/ibus/IbusProtocol.js';
import { config } from './config.js';
import Logger from './lib/log.js';
import { FullIbusMessage, IbusMessage } from './types/index.js';

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

// Accepts a raw frame as space-separated hex bytes, exactly as it appears on the
// bus/in reference docs: src len dst [data...] crc — e.g. "80 04 BF 11 01 2B".
// len/crc are only used to sanity-check the typed frame; the outgoing message is
// always sent with a freshly computed length and checksum.
const parseFrame = (line: string): IbusMessage | undefined => {
  const bytes = line
    .trim()
    .split(/\s+/)
    .map((token) => parseInt(token, 16));

  if (bytes.length < 4 || bytes.some((b) => Number.isNaN(b) || b < 0 || b > 0xff)) {
    log.error('Invalid frame "%s" — expected space-separated hex bytes: src len dst [data...] crc', line);
    return undefined;
  }

  const [src, , dst, ...rest] = bytes;
  const typedCrc = rest.pop() as number;
  const message: IbusMessage = { src, dst, msg: Buffer.from(rest) };

  const expectedCrc = createBufferFromIbusMessage(message).at(-1);
  if (typedCrc !== expectedCrc) {
    log.warn(
      'Checksum mismatch in "%s" (typed 0x%s, expected 0x%s) — sending with the correct checksum anyway',
      line,
      typedCrc.toString(16),
      expectedCrc?.toString(16),
    );
  }

  return message;
};

const sendFromInput = (line: string) => {
  if (!line.trim()) {
    return;
  }

  const message = parseFrame(line);
  if (!message) {
    return;
  }

  ibusInterface.sendMessage(message);
  log.notice('Sent src:0x%s dst:0x%s msg:%O', message.src.toString(16), message.dst.toString(16), message.msg);
};

const term = () => {
  log.notice('Shutting down ibus monitor');
  ibusInterface.shutdown(() => process.exit());
};

process.on('SIGTERM', term);
process.on('SIGINT', term);

log.notice('Starting ibus monitor on %s', ibusTransceiverPath);
log.notice('Type a raw frame as hex bytes to send it (src len dst data... crc), e.g: 80 04 BF 11 01 2B');
ibusInterface.on('data', logMessage, { context });
readline.createInterface({ input: process.stdin }).on('line', sendFromInput);
ibusInterface.startup();
