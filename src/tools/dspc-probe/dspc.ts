import { IbusDeviceId, IbusMessage } from '../../types/index.js';

// DSP-C facts used across the probe. See DEBUG-DSPC.md.

export const DSPC = IbusDeviceId.DSPC;

// Replies we already understand: poll answer `EA → xx 02 00` and diagnostic ident `EA → 3F A0 …`.
// Anything else from 0xEA is new information.
export const isKnownDspcFrame = (message: IbusMessage): boolean =>
  (message.msg[0] === 0x02 && message.msg[1] === 0x00) || (message.dst === IbusDeviceId.DIA && message.msg[0] === 0xa0);

// `02 01` = ready after reset: the DSP-C's application (re)started, or a command made it reset.
export const isResetAnnounce = (message: IbusMessage): boolean =>
  message.src === DSPC && message.msg[0] === 0x02 && message.msg[1] === 0x01;

export const isPollReply = (message: IbusMessage): boolean => message.src === DSPC && message.msg[0] === 0x02;

// 0x67 is where the DSP-C sends its status replies, so it's the poll source closest to the car.
export const POLL: IbusMessage = { src: IbusDeviceId.ONL, dst: DSPC, msg: Buffer.from([0x01]) };

// After an ANT power-up the DSP-C ignores polls until it has seen this diagnostic ident request
// (confirmed on the bench). It's read-only and the only 0x3F frame the probe sends.
export const IDENT: IbusMessage = { src: IbusDeviceId.DIA, dst: DSPC, msg: Buffer.from([0x00]) };
