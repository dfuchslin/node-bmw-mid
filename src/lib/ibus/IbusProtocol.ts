/*
From https://github.com/osvathrobi/node-ibus
Added here to support updated 'serialport' versions
Also rudimentary conversion to typescript
*/

import Logger from 'log';
import { Transform, TransformCallback } from 'stream';
import { FullIbusMessage, IbusMessage } from '../../types/ibus';

const namespace = 'ibus-protocol';
const log = Logger.get(namespace);

export class IbusProtocol extends Transform {
  private _buffer: Buffer;
  private _processId: number;
  private _isProcessing: boolean;

  constructor(options = {}) {
    super();

    Transform.call(this, options);

    this._buffer = Buffer.alloc(0);
    this._processId = 0;
    this._isProcessing = false;
  }

  _transform(chunk: any, encoding: BufferEncoding, done: TransformCallback) {
    if (this._isProcessing === true) {
      log.error('[IbusProtocol] Error. This _transform function should NOT be running..');
    }

    this._isProcessing = true;

    log.debug('[IbusProtocol] Processing: %d', this._processId);
    log.debug('[IbusProtocol] Current buffer: %O', this._buffer);
    log.debug('[IbusProtocol] Current chunk: %O', chunk);

    this._processId++;

    this._buffer = Buffer.concat([this._buffer, chunk]);

    const cchunk = this._buffer;

    log.debug('[IbusProtocol] Concated chunk: %O', cchunk);

    if (cchunk.length < 5) {
      // chunk too small, gather more data
    } else {
      log.debug('[IbusProtocol]', 'Analyzing: ', cchunk);

      // gather messages from current chunk
      const messages: FullIbusMessage[] = [];

      let endOfLastMessage = -1;

      let mSrc;
      let mLen;
      let mDst;
      let mMsg;
      let mCrc;

      // look for messages in current chunk
      for (let i = 0; i < cchunk.length - 5; i++) {
        // BEGIN MESSAGE
        mSrc = cchunk[i + 0];
        mLen = cchunk[i + 1];
        mDst = cchunk[i + 2];

        // test to see if have enough data for a complete message
        if (cchunk.length >= i + 2 + mLen) {
          mMsg = cchunk.subarray(i + 3, i + 3 + mLen - 2);
          mCrc = cchunk[i + 2 + mLen - 1];

          let crc = 0x00;

          crc = crc ^ mSrc;
          crc = crc ^ mLen;
          crc = crc ^ mDst;

          for (let j = 0; j < mMsg.length; j++) {
            crc = crc ^ mMsg[j];
          }

          if (crc === mCrc) {
            messages.push({
              id: Date.now(),
              src: mSrc,
              len: mLen,
              dst: mDst,
              msg: mMsg,
              crc: mCrc,
            });

            // mark end of last message
            endOfLastMessage = i + 2 + mLen;

            // skip ahead
            i = endOfLastMessage - 1;
          }
        }
        // END MESSAGE
      }

      if (messages.length > 0) {
        const emitMessage = (message: IbusMessage) => {
          this.emit('message', message);
        };
        messages.forEach(emitMessage);
        // messages.forEach(function (message) {
        //   this.emit('message', message);
        // });
      }

      // Push the remaining data back to the stream
      if (endOfLastMessage !== -1) {
        // Push the remaining chunk from the end of the last valid Message
        this._buffer = cchunk.subarray(endOfLastMessage);

        log.debug('[IbusProtocol] Sliced data: ', endOfLastMessage, this._buffer);
      } else {
        // Push the entire chunk
        if (this._buffer.length > 500) {
          // Chunk too big? (overflow protection)
          log.warning('[IbusProtocol] dropping some data..');
          this._buffer = cchunk.subarray(chunk.length - 300);
        }
      }
    }

    log.debug('[IbusProtocol]', 'Buffered messages size: ', this._buffer.length);
    this._isProcessing = false;
    done();
  }
}

export const createBufferFromIbusMessage = (msg: IbusMessage) => {
  // 1 + 1 + 1 + msgLen + 1
  const packetLength = 4 + msg.msg.length;
  const buf = Buffer.alloc(packetLength);

  buf[0] = msg.src;
  buf[1] = msg.msg.length + 2;
  buf[2] = msg.dst;

  for (let i = 0; i < msg.msg.length; i++) {
    buf[3 + i] = msg.msg[i];
  }

  let crc = 0x00;
  for (let i = 0; i < buf.length - 1; i++) {
    crc ^= buf[i];
  }

  buf[3 + msg.msg.length] = crc;

  return buf;
};
