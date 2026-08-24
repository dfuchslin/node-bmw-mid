import { ascii2paddedHex, buildMessage, utf82paddedHex } from '../message.js';
import {
  FullIbusMessage,
  IbusDeviceId,
  NowPlaying,
  PlaybackEvent,
  PlaybackVolume,
  PlaybackZoneState,
} from '../../types/index.js';
import { IbusDevice, IbusDeviceConfig } from './IbusDevice.js';

// Menu-row button ids (msg[3] low nibble on a 0x31 broadcast, src:MID dst:RAD).
// Cross-referenced against three independent sources (kmalinich/node-bmw-client's
// modules/MID.js, docs/messages.js, docs/RAD.cpp) which agree on the bit layout
// (id = msg[3] & 0x0F; high bits 0x20 = held, 0x40 = released, neither = pressed)
// but NOT on the base numbering. docs/RAD.cpp's handleMIDbutton — real firmware
// logic, not just a captured-log comment — resolves it: `switchToSource(button/2)`
// only works if buttons are numbered sequentially 0-11, two per section (left/right).
// Ids below 0x0C are filled in on that basis; anything beyond is unconfirmed.
// The fixed hardware buttons (power, BC, clock, audio-source, tel) are a SEPARATE
// message family entirely — see the note on handleButtonPress.
enum MidButtonId {
  Section1Left = 0x00, // play/pause
  Section1Right = 0x01,
  Section2Left = 0x02,
  Section2Right = 0x03,
  Section3Left = 0x04,
  Section3Right = 0x05,
  Section4Left = 0x06,
  Section4Right = 0x07,
  Section5Left = 0x08,
  Section5Right = 0x09,
  Tone = 0x0a,
  Options = 0x0b,
}

const createProgressBars = (width: number) => {
  const result: number[][] = [];
  let i = 0;
  while (i < width) {
    [0xbf, 0xb0, 0xb1, 0xb9, 0xcf].forEach((char) => {
      const row = new Array(width).fill(0x5f);
      row[i] = char;
      result.push(row);
    });
    i++;
  }
  return result;
};
const volumeProgressBars = createProgressBars(10);

const SYMBOL_PAUSE = 0xbe;
const SYMBOL_PLAY = 0xbc;

class RAD extends IbusDevice {
  private lastZoneState: PlaybackZoneState | undefined;
  private volumeTimestamp = 0;

  constructor(config: IbusDeviceConfig) {
    super(IbusDeviceId.RAD, config);
  }

  init(): void {
    this.log.notice('init');
    this.eventBus.on(PlaybackEvent.ZoneUpdated, (state: PlaybackZoneState) => this.handleZoneUpdate(state), {
      context: this.context,
    });
  }

  term(): void {
    this.log.notice('term');
  }

  parseMessage(message: FullIbusMessage): void {
    switch (message.msg[0]) {
      case 0x32: {
        this.handleVolume(message);
        break;
      }
      case 0x31: {
        this.handleButtonPress(message);
        break;
      }
      default:
        this.log.warn('Unhandled message!', message.msg);
    }
  }

  private handleVolume(message: FullIbusMessage): void {
    // Broadcast: Volume control
    // data.msg[1] -
    // -1 : 10
    // -2 : 20
    // -3 : 30
    // -4 : 40
    // -5 : 50
    // +1 : 11
    // +2 : 21
    // +3 : 31
    // +4 : 41
    // +5 : 51

    const volume = message.msg[1];

    // Determine volume change direction
    const direction = volume & 0x01 && true ? '+' : '-';
    const volume_inc = Math.floor(volume / 0x10);
    const steps = direction === '+' ? volume_inc : -volume_inc;

    this.log.notice(`volume ${direction} ${volume_inc} (${volume})`);

    this.eventBus.emit(PlaybackEvent.VolumeChangeRequested, { steps }, { context: this.context });

    // Only render an optimistic overlay once we know the real min/max/value for this zone —
    // never assume a scale (e.g. dB zones aren't 0-100).
    const current = this.lastZoneState?.volume;
    if (current) {
      let nextValue = current.value + steps;
      if (nextValue < current.min) nextValue = current.min;
      if (nextValue > current.max) nextValue = current.max;
      const nudged: PlaybackVolume = { ...current, value: nextValue };
      this.lastZoneState = { ...this.lastZoneState, volume: nudged } as PlaybackZoneState;
      this.renderVolumeOverlay(message.src, nudged);
    }

    this.volumeTimestamp = Date.now();
    setTimeout(() => {
      if (Date.now() - this.volumeTimestamp >= 5_000) {
        this.lastZoneState?.nowPlaying ? this.renderNowPlaying(this.lastZoneState.nowPlaying) : this.clearScreen();
      }
    }, 5_000);
  }

  private handleButtonPress(message: FullIbusMessage): void {
    // Broadcast: menu button pressed/held/released (see MidButtonId above for the id
    // scheme). msg[2] is a context/menu byte, not part of button identity. Logged at
    // notice level for every button so ids beyond MidButtonId can be captured/confirmed
    // by pressing each physical button and reading the logs.
    //
    // NOTE: this does not cover the fixed hardware buttons (power, BC, clock,
    // audio-source, tel-answer/hangup) — those use a different broadcast entirely
    // (src:MID dst:LOC msg[0]=0x20, e.g. the power button's captured
    // `<Buffer 20 20 b2 00>` press / `<Buffer 20 60 b2 00>` hold) which never reaches
    // this device's parseMessage since dst=LOC has no registered handler in router.ts —
    // those still show up via router.ts's "unhandled" log instead.
    const buttonId = message.msg[3] & 0x0f;
    const stateBits = message.msg[3] & 0x60;
    const state = stateBits === 0x20 ? 'held' : stateBits === 0x40 ? 'released' : 'pressed';

    this.log.notice('MID menu button %s: id=0x%s msg:', state, buttonId.toString(16), message.msg);

    if (buttonId !== MidButtonId.Section1Left || state !== 'pressed') return;

    this.eventBus.emit(PlaybackEvent.PlayPauseRequested, undefined, { context: this.context });
  }

  private handleZoneUpdate(state: PlaybackZoneState): void {
    this.lastZoneState = state;
    this.renderPlayPauseButton(state.state);
    if (Date.now() - this.volumeTimestamp < 5_000) return; // top-row overlay guard, unrelated to the button row
    state.nowPlaying ? this.renderNowPlaying(state.nowPlaying) : this.clearScreen();
    // display-only: do NOT emit PlaybackEvent.VolumeChangeRequested from here
  }

  private renderVolumeOverlay(dstId: IbusDeviceId, volume: PlaybackVolume): void {
    const range = volume.max - volume.min || 1;
    const pct = (volume.value - volume.min) / range;

    let progressBarIndex = Math.floor(pct * volumeProgressBars.length);
    if (progressBarIndex >= volumeProgressBars.length) progressBarIndex = volumeProgressBars.length - 1;
    if (progressBarIndex < 0) progressBarIndex = 0;

    const displayValue = Math.round(volume.value).toString().padStart(3, ' ');

    // Upper left - 11 char radio display
    let msg = Buffer.from([0x23, 0x40, 0x20]);
    msg = Buffer.concat([msg, ascii2paddedHex(`Vol ${displayValue}dB`, 11)]);
    this.ibusInterface.sendMessage(buildMessage(this.id, dstId, msg));

    // Upper right - 20 char obc display
    msg = Buffer.from([0x23, 0x40, 0x20]);
    msg = Buffer.concat([
      msg,
      Buffer.from([0xc6, 0xc8, 0x20]),
      Buffer.from(volumeProgressBars[progressBarIndex]),
      Buffer.from(new Array(7).fill(0x20)),
    ]);
    this.ibusInterface.sendMessage(buildMessage(IbusDeviceId.IKE, dstId, msg));
  }

  private renderNowPlaying(nowPlaying: NowPlaying): void {
    // Upper left - 11 char radio display
    let msg = Buffer.from([0x23, 0x40, 0x20]);
    msg = Buffer.concat([msg, utf82paddedHex(nowPlaying.title, 11)]);
    this.ibusInterface.sendMessage(buildMessage(this.id, IbusDeviceId.MID, msg));

    // Upper right - 20 char obc display
    msg = Buffer.from([0x23, 0x40, 0x20]);
    msg = Buffer.concat([msg, utf82paddedHex(nowPlaying.artist, 20)]);
    this.ibusInterface.sendMessage(buildMessage(IbusDeviceId.IKE, IbusDeviceId.MID, msg));
  }

  private renderPlayPauseButton(state: PlaybackZoneState['state']): void {
    const symbol = state === 'playing' ? SYMBOL_PAUSE : SYMBOL_PLAY;
    const msg = Buffer.concat([
      Buffer.from([0x21, 0x40, 0x00, 0x40, 0x06]),
      Buffer.from([symbol, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20]), // "X   " + right button half, blank
    ]);
    this.ibusInterface.sendMessage(buildMessage(IbusDeviceId.RAD, IbusDeviceId.MID, msg));
  }

  private clearScreen(): void {
    const msg = Buffer.from([0x23, 0xe0, 0x20]);
    this.ibusInterface.sendMessage(buildMessage(IbusDeviceId.RAD, IbusDeviceId.MID, msg));
  }
}

export default RAD;
