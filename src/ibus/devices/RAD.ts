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

class RAD extends IbusDevice {
  private lastZoneState: PlaybackZoneState | undefined;
  private volumeTimestamp = 0;
  private main_volume: PlaybackVolume = { value: 0, min: 0, max: 100, isMuted: false };

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

    const current = this.lastZoneState?.volume ?? this.main_volume;
    let nextValue = current.value + steps;
    if (nextValue < current.min) nextValue = current.min;
    if (nextValue > current.max) nextValue = current.max;
    this.main_volume = { value: nextValue, min: current.min, max: current.max, isMuted: current.isMuted };

    this.log.notice(`volume ${direction} ${volume_inc} (${volume}) --> ${nextValue}`);

    this.renderVolumeOverlay(message.src, this.main_volume);

    this.eventBus.emit(PlaybackEvent.VolumeChangeRequested, { steps }, { context: this.context });

    this.volumeTimestamp = Date.now();
    setTimeout(() => {
      if (Date.now() - this.volumeTimestamp >= 5_000) {
        this.lastZoneState?.nowPlaying ? this.renderNowPlaying(this.lastZoneState.nowPlaying) : this.clearScreen();
      }
    }, 5_000);
  }

  private handleZoneUpdate(state: PlaybackZoneState): void {
    this.lastZoneState = state;
    if (Date.now() - this.volumeTimestamp < 5_000) return; // a volume overlay is currently showing — don't stomp it
    state.nowPlaying ? this.renderNowPlaying(state.nowPlaying) : this.clearScreen();
    // display-only: do NOT emit PlaybackEvent.VolumeChangeRequested from here
  }

  private renderVolumeOverlay(dstId: IbusDeviceId, volume: PlaybackVolume): void {
    const range = volume.max - volume.min || 1;
    const pct = (volume.value - volume.min) / range;
    const displayValue = Math.round(pct * 100);

    let progressBarIndex = Math.floor(pct * volumeProgressBars.length);
    if (progressBarIndex >= volumeProgressBars.length) progressBarIndex = volumeProgressBars.length - 1;
    if (progressBarIndex < 0) progressBarIndex = 0;

    // Upper left - 11 char radio display
    let msg = Buffer.from([0x23, 0x40, 0x20]);
    msg = Buffer.concat([msg, ascii2paddedHex(`Vol ${displayValue}`, 11)]);
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

  private clearScreen(): void {
    const msg = Buffer.from([0x23, 0xe0, 0x20]);
    this.ibusInterface.sendMessage(buildMessage(IbusDeviceId.RAD, IbusDeviceId.MID, msg));
  }
}

export default RAD;
