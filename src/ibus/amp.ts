import { IbusDeviceId, IbusMessage } from '../types/index.js';

// Emulated DSP amplifier state, as reported to the DSP-C with `6A → EA 35`. On the bench the DSP-C sends
// its button presses as `EA → 6A 34 xx` commands, retries them until the amp answers, and blanks its LCD
// when nothing comes back. Layout confirmed on the bench (bytes per wilhelm-docs dsp/35.md):
//   35 MO EC RM B1..B7: mode, echo/reverb, room (0x20 set), 7 EQ bands (band << 5 | sign 0x10 | level)
//   34 08..0F: select mode (low 3 bits; 0F is "DSP OFF")
//   34 1M XX: EQ band for mode M (XX uses the 35 band encoding)
//   34 9M XX: room size for mode M when XX has 0x20 set, otherwise echo/reverb
//   34 28: settings request at startup (any other 34 command is answered with the status too)
// Each mode keeps its own settings, and the status always reports the selected mode's.

type ModeSettings = { echo: number; room: number; bands: number[] };

const MODES = 8;
// From the amp memory frame in the real E38 capture: 6A 0D EA 35 06 07 27 08 29 4A 69 88 A7 C6
const initialSettings = (): ModeSettings => ({
  echo: 0x07,
  room: 0x27,
  bands: [0x08, 0x29, 0x4a, 0x69, 0x88, 0xa7, 0xc6],
});

export class AmpState {
  private mode = 0x06;
  private readonly settings: ModeSettings[] = Array.from({ length: MODES }, initialSettings);

  // Applies a DSP-C command and returns the status reply, or undefined for commands that aren't `34`.
  handle(request: IbusMessage): IbusMessage | undefined {
    const [command, sub, value] = request.msg;
    if (command !== 0x34) {
      return undefined;
    }

    const target = this.settings[sub & 0x07];
    switch (sub & 0xf8) {
      case 0x08:
        this.mode = sub & 0x07;
        break;

      case 0x10:
        if (value !== undefined) {
          target.bands[(value >> 5) & 0x07] = value;
        }
        break;

      case 0x90:
        if (value !== undefined && value & 0x20) {
          target.room = value;
        } else if (value !== undefined) {
          target.echo = value;
        }
        break;

      default:
        break;
    }
    return this.status();
  }

  status(): IbusMessage {
    const { echo, room, bands } = this.settings[this.mode];
    return { src: IbusDeviceId.DSP, dst: IbusDeviceId.DSPC, msg: Buffer.from([0x35, this.mode, echo, room, ...bands]) };
  }
}
