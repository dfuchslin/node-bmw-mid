import { IbusDeviceId, IbusMessage } from '../../types/index.js';
import { FrameMatcher, matchesFrame, parseFrame } from '../frames.js';
import { BridgeClient, BusFrame } from './bridge-client.js';
import { AmpState } from './amp.js';
import { DSPC } from './dspc.js';
import { Recorder } from './recorder.js';

// Devices we stand in for when something polls them. Real devices on the bench (MID, DSP-C) answer for
// themselves, and we never answer AS the DSP-C — that would fake exactly the replies we're looking for.
const EMULATED_DEVICES = [IbusDeviceId.RAD, IbusDeviceId.IKE, IbusDeviceId.TEL, IbusDeviceId.DSP, IbusDeviceId.LCM];

type Responder = {
  name: string;
  when: (request: IbusMessage) => boolean;
  reply: (request: IbusMessage) => IbusMessage;
};

const matching = (matcher: FrameMatcher) => (request: IbusMessage) => matchesFrame(request, matcher);

const amp = new AmpState();

const frame = (hex: string) => parseFrame(hex).message as IbusMessage;

const RESPONDERS: Responder[] = [
  {
    // DSP-C → IKE: language/region request → IKE coding (EN-GB, metric, 24 h) from the real E38 capture
    name: 'ike-coding',
    when: matching({ src: DSPC, dst: IbusDeviceId.IKE, prefix: [0x14] }),
    reply: () => frame('80 07 BF 15 01 04 80 42 EA'),
  },
  {
    // DSP-C → amp: settings request (34 28) and button commands (34 xx) — answered with the amp's 35 status
    name: 'amp',
    when: matching({ src: DSPC, dst: IbusDeviceId.DSP, prefix: [0x34] }),
    reply: (request) => amp.handle(request) as IbusMessage,
  },
  {
    name: 'device-status',
    when: matching({ dst: EMULATED_DEVICES, prefix: [0x01] }),
    reply: ({ dst }) => ({
      src: dst,
      dst: dst === IbusDeviceId.RAD ? IbusDeviceId.LOC : IbusDeviceId.GLO,
      msg: Buffer.from([0x02, 0x00]),
    }),
  },
];

export class Responders {
  enabled = false;

  constructor(
    private readonly bridge: BridgeClient,
    private readonly recorder: Recorder,
  ) {
    bridge.on('frame', (busFrame) => this.onFrame(busFrame));
  }

  set(enabled: boolean): void {
    this.enabled = enabled;
    this.recorder.marker(`responders: ${enabled ? 'on' : 'off'}`);
  }

  private onFrame({ message, echo }: BusFrame): void {
    if (!this.enabled || echo) {
      return;
    }
    const responder = RESPONDERS.find(({ when }) => when(message));
    if (!responder) {
      return;
    }
    const reply = responder.reply(message);
    if (reply.src === DSPC) {
      return;
    }
    const hex = this.bridge.send(reply);
    this.recorder.record('autoReply', { responder: responder.name, hex });
    this.recorder.print(`auto-reply (${responder.name}) [${hex}]`);
  }
}
