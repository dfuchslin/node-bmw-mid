import { ascii2paddedHex, buildMessage, utf82hex } from '../message.js';
import {
  DisplayEvent,
  FullIbusMessage,
  GPIO,
  GPIOState,
  IbusDeviceId,
  NowPlaying,
  NowPlayingMode,
  NowPlayingModeChangedPayload,
  PixelTestTogglePayload,
  PlaybackEvent,
  PlaybackVolume,
  PlaybackZoneState,
} from '../../types/index.js';
import { IbusDevice, IbusDeviceConfig } from './IbusDevice.js';
import gpio from '../../gpio/index.js';
import { config as appConfig } from '../../config.js';

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
const SYMBOL_LOADING = 0xc3;

// Volume-knob fill levels for pixel test mode, index 0 (blank) .. 7 (fully filled).
const PIXEL_LEVELS = [0x20, 0x5f, 0xb7, 0xb6, 0xb5, 0xb4, 0xb3, 0xb2];

// The confirmed-working top-row field widths (see renderNowPlaying/renderVolumeOverlay/
// renderPixelTestTopRows) — 11 left + 21 right, both messages from RAD, read together
// as one uninterrupted 32-char line.
const TOP_LEFT_WIDTH = 11;
const TOP_RIGHT_WIDTH = 21;
const TOP_ROW_WIDTH = TOP_LEFT_WIDTH + TOP_RIGHT_WIDTH;

const SCROLL_STEP_CHARS = 1;
const SCROLL_HOLD_MS = 2_000; // pause at the start and at the end of each scroll loop

const BUTTON_ROW_SECTIONS = 6;
const BUTTON_HALF_WIDTH = 4;
const BLANK_BUTTON_HALF = Buffer.alloc(BUTTON_HALF_WIDTH, 0x20);

const RENDER_TICK_MS = 200;
const VOLUME_OVERLAY_MS = 5_000;
const LOADING_BLINK_MS = 1_000;

// Joins 6 section halves (4 bytes each) with the 0x05 separator the MID expects
// between segments in a batched menu-row write (verified against docs/MID.js's
// refresh_text(), which sends button_1..6 and button_7..12 this way).
const joinButtonRowHalves = (halves: Buffer[]): Buffer => {
  const parts: Buffer[] = [];
  halves.forEach((half, i) => {
    if (i > 0) parts.push(Buffer.from([0x05]));
    parts.push(half);
  });
  return Buffer.concat(parts);
};

class RAD extends IbusDevice {
  private lastZoneState: PlaybackZoneState | undefined;
  private renderTick: ReturnType<typeof setInterval> | undefined;

  // Mirrors the backlight: when the knob's power button turns the light off, all
  // rendering suspends (and the display is blanked once); turning it back on forces
  // a full refresh of whatever should currently be showing.
  private displayEnabled = true;

  // Top row (text fields) desired state — a tick flushes this, not the handlers.
  private topRowMode: 'volume' | 'now-playing' | 'blank' | 'pixeltest' = 'blank';
  private topRowDirty = false;
  private volumeOverlayDst: IbusDeviceId = IbusDeviceId.MID;
  private volumeOverlayUntil = 0;

  // Pixel test mode: while active, the knob sweeps a fill level across the whole
  // display instead of changing real volume (see handleVolume/adjustPixelTestLevel).
  private pixelTestActive = false;
  private pixelTestLevel = PIXEL_LEVELS.length - 1;

  // Which now-playing display style is active — set from config at startup, and
  // switchable live via the /nowplaying-mode/:mode route (DisplayEvent.NowPlayingModeChanged).
  private nowPlayingMode: NowPlayingMode = appConfig.mid.nowPlayingMode;

  // "artist <sep> title" scroll state. nowPlayingScrollKey tracks what the buffer was
  // last built from, so unrelated zone updates (volume/state changes) don't reset the
  // scroll position — only an actual artist/title change does.
  private nowPlayingScrollKey = '';
  private nowPlayingScrollText = Buffer.alloc(0);
  private nowPlayingScrollOffset = 0;
  private nowPlayingScrollHoldUntil = 0;

  // Alternating artist/title state: which field is showing, when its slot began, and
  // (only relevant once past the slot's halfway point) how far it's scrolled — always
  // restarts from 0 the next time that field's turn comes around.
  private alternatingField: 'artist' | 'title' = 'artist';
  private alternatingFieldStartedAt = 0;
  private alternatingScrollOffset = 0;

  // Button row (menu section content), 0-indexed (section 1 = index 0). Unified
  // state so any single section update re-sends the full row without clobbering
  // the other sections.
  private buttonRowLeft: Buffer[] = Array.from({ length: BUTTON_ROW_SECTIONS }, () => BLANK_BUTTON_HALF);
  private buttonRowRight: Buffer[] = Array.from({ length: BUTTON_ROW_SECTIONS }, () => BLANK_BUTTON_HALF);
  private buttonRowDirty = false;
  private loadingBlinkPhase = false;
  private lastBlinkToggle = 0;

  constructor(config: IbusDeviceConfig) {
    super(IbusDeviceId.RAD, config);
  }

  init(): void {
    this.log.notice('init');
    this.eventBus.on(PlaybackEvent.ZoneUpdated, (state: PlaybackZoneState) => this.handleZoneUpdate(state), {
      context: this.context,
    });
    this.eventBus.on(GPIO.Light, (state: GPIOState) => this.handleLightChange(state), { context: this.context });
    this.eventBus.on(
      DisplayEvent.PixelTestToggled,
      ({ enabled }: PixelTestTogglePayload) => this.handlePixelTestToggle(enabled),
      { context: this.context },
    );
    this.eventBus.on(
      DisplayEvent.NowPlayingModeChanged,
      ({ mode }: NowPlayingModeChangedPayload) => this.handleNowPlayingModeChange(mode),
      { context: this.context },
    );
    this.renderTick = setInterval(() => this.tick(), RENDER_TICK_MS);

    // Sync displayEnabled with the real backlight state at startup, rather than assuming
    // it's on — read directly since this is a one-time boot query, not an ongoing signal.
    gpio.isLightOn().then((isOn) => {
      if (isOn === undefined) return; // GPIO not connected — keep the default (enabled)
      this.handleLightChange(isOn ? GPIOState.On : GPIOState.Off);
    });
  }

  term(): void {
    this.log.notice('term');
    if (this.renderTick) clearInterval(this.renderTick);
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

  // Backlight off -> blank the physical display once, then suspend the render loop
  // entirely (handleVolume/handleZoneUpdate keep tracking state but stop marking
  // anything dirty while disabled). Backlight on -> resume and force a full refresh.
  private handleLightChange(state: GPIOState): void {
    if (state === GPIOState.Off) {
      if (!this.displayEnabled) return;
      this.displayEnabled = false;
      this.clearScreen();
      this.buttonRowLeft = Array.from({ length: BUTTON_ROW_SECTIONS }, () => BLANK_BUTTON_HALF);
      this.buttonRowRight = Array.from({ length: BUTTON_ROW_SECTIONS }, () => BLANK_BUTTON_HALF);
      this.clearButtonRow();
      this.eventBus.emit(PlaybackEvent.PauseRequested, undefined, { context: this.context });
      return;
    }

    if (state === GPIOState.On) {
      if (this.displayEnabled) return;
      this.displayEnabled = true;
      if (this.topRowMode !== 'volume' && !this.pixelTestActive) {
        this.topRowMode = this.lastZoneState?.nowPlaying ? 'now-playing' : 'blank';
      }
      this.topRowDirty = true;
      if (this.pixelTestActive) {
        // Backlight-off cleared the screen/button row — redraw the fill level
        // instead of the real play/pause section.
        this.applyPixelTestLevel();
      } else {
        this.updatePlayPauseSection();
      }
    }
  }

  // The single render loop: on a fixed cadence, checks whether any time-based
  // transition (volume-overlay expiry, loading-symbol blink) is due, then flushes
  // whatever's dirty. No other method sends bytes directly — everything else just
  // updates desired state and marks it dirty.
  private tick(): void {
    if (!this.displayEnabled) return;

    const now = Date.now();

    if (this.topRowMode === 'volume' && now >= this.volumeOverlayUntil) {
      this.topRowMode = this.lastZoneState?.nowPlaying ? 'now-playing' : 'blank';
      this.topRowDirty = true;
    }

    if (this.lastZoneState?.state === 'loading' && now - this.lastBlinkToggle >= LOADING_BLINK_MS) {
      this.loadingBlinkPhase = !this.loadingBlinkPhase;
      this.lastBlinkToggle = now;
      this.updatePlayPauseSection();
    }

    if (
      this.topRowMode === 'now-playing' &&
      this.nowPlayingMode === 'scroll' &&
      this.nowPlayingScrollText.length > TOP_ROW_WIDTH &&
      now >= this.nowPlayingScrollHoldUntil
    ) {
      const maxOffset = this.nowPlayingScrollText.length - TOP_ROW_WIDTH;
      this.nowPlayingScrollOffset =
        this.nowPlayingScrollOffset >= maxOffset ? 0 : Math.min(this.nowPlayingScrollOffset + SCROLL_STEP_CHARS, maxOffset);
      this.nowPlayingScrollHoldUntil =
        this.nowPlayingScrollOffset === 0 || this.nowPlayingScrollOffset === maxOffset ? now + SCROLL_HOLD_MS : now;
      this.topRowDirty = true;
    }

    if (this.topRowMode === 'now-playing' && this.nowPlayingMode === 'alternating' && this.lastZoneState?.nowPlaying) {
      const durationMs = appConfig.mid.nowPlayingAlternateSeconds * 1000;
      const elapsed = now - this.alternatingFieldStartedAt;

      if (elapsed >= durationMs) {
        this.alternatingField = this.alternatingField === 'artist' ? 'title' : 'artist';
        this.alternatingFieldStartedAt = now;
        this.alternatingScrollOffset = 0;
        this.topRowDirty = true;
      } else if (elapsed >= durationMs / 2) {
        const text = utf82hex(
          this.alternatingField === 'artist' ? this.lastZoneState.nowPlaying.artist : this.lastZoneState.nowPlaying.title,
        );
        const maxOffset = text.length - TOP_ROW_WIDTH;
        if (maxOffset > 0 && this.alternatingScrollOffset < maxOffset) {
          this.alternatingScrollOffset += SCROLL_STEP_CHARS;
          this.topRowDirty = true;
        }
      }
    }

    if (this.topRowDirty) {
      this.flushTopRow();
      this.topRowDirty = false;
    }
    if (this.buttonRowDirty) {
      this.flushButtonRow();
      this.buttonRowDirty = false;
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

    if (this.pixelTestActive) {
      this.adjustPixelTestLevel(steps);
      return;
    }

    this.log.notice(`volume ${direction} ${volume_inc} (${volume})`);

    this.eventBus.emit(PlaybackEvent.VolumeChangeRequested, { steps }, { context: this.context });

    // Only nudge/render an optimistic overlay once we know the real min/max/value for
    // this zone — never assume a scale (e.g. dB zones aren't 0-100).
    const current = this.lastZoneState?.volume;
    if (current) {
      let nextValue = current.value + steps;
      if (nextValue < current.min) nextValue = current.min;
      if (nextValue > current.max) nextValue = current.max;
      const nudged: PlaybackVolume = { ...current, value: nextValue };
      this.lastZoneState = { ...this.lastZoneState, volume: nudged } as PlaybackZoneState;
    }

    if (this.displayEnabled) {
      this.topRowMode = 'volume';
      this.volumeOverlayDst = message.src;
      this.volumeOverlayUntil = Date.now() + VOLUME_OVERLAY_MS;
      this.topRowDirty = true;
    }
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
    const enteringLoading = state.state === 'loading' && this.lastZoneState?.state !== 'loading';
    this.lastZoneState = state; // keep tracking even while disabled, so re-enable shows fresh content
    this.updateNowPlayingScrollText(state.nowPlaying);

    if (!this.displayEnabled) return;

    if (enteringLoading) {
      // Always start a fresh loading transition by showing the loading symbol immediately.
      this.loadingBlinkPhase = true;
      this.lastBlinkToggle = Date.now();
    }
    this.updatePlayPauseSection();

    if (this.topRowMode !== 'volume' && !this.pixelTestActive) {
      // display-only: do NOT emit PlaybackEvent.VolumeChangeRequested from here
      this.topRowMode = state.nowPlaying ? 'now-playing' : 'blank';
      this.topRowDirty = true;
    }
  }

  // Rebuilds the "artist <sep> title" scroll buffer only when the content actually
  // changed — an unrelated zone update (volume/state) must not reset scroll position
  // mid-scroll, and switching away to the volume overlay and back should resume where
  // it left off.
  private updateNowPlayingScrollText(nowPlaying: NowPlaying | null): void {
    if (!nowPlaying) {
      this.nowPlayingScrollKey = '';
      return;
    }

    const key = `${nowPlaying.artist}\0${nowPlaying.title}`;
    if (key === this.nowPlayingScrollKey) return;

    this.nowPlayingScrollKey = key;
    this.nowPlayingScrollText = Buffer.concat([
      utf82hex(nowPlaying.artist),
      Buffer.from([0x20, 0xc3, 0x20]),
      utf82hex(nowPlaying.title),
    ]);
    this.nowPlayingScrollOffset = 0;
    this.nowPlayingScrollHoldUntil = Date.now() + SCROLL_HOLD_MS;
    this.resetAlternatingState();
  }

  // Toggled by the /nowplaying-mode/:mode route via DisplayEvent.NowPlayingModeChanged.
  private handleNowPlayingModeChange(mode: NowPlayingMode): void {
    if (mode === this.nowPlayingMode) return;
    this.nowPlayingMode = mode;
    this.resetAlternatingState();
    this.topRowDirty = true;
  }

  private resetAlternatingState(): void {
    this.alternatingField = 'artist';
    this.alternatingFieldStartedAt = Date.now();
    this.alternatingScrollOffset = 0;
  }

  // Toggled by the /pixeltest/:state route via DisplayEvent.PixelTestToggled. While
  // active, handleVolume() diverts the knob to adjustPixelTestLevel() instead of
  // requesting a real volume change, so lastZoneState.volume is never touched here —
  // the real volume is implicitly "restored" on exit simply because it was never
  // changed in the first place.
  private handlePixelTestToggle(enabled: boolean): void {
    if (enabled) {
      if (this.pixelTestActive) return;
      this.pixelTestActive = true;
      this.pixelTestLevel = PIXEL_LEVELS.length - 1; // start fully filled (0xb2)
      this.topRowMode = 'pixeltest';
      this.applyPixelTestLevel();
      return;
    }

    if (!this.pixelTestActive) return;
    this.pixelTestActive = false;
    this.topRowMode = this.lastZoneState?.nowPlaying ? 'now-playing' : 'blank';
    this.topRowDirty = true;
    this.buttonRowLeft = Array.from({ length: BUTTON_ROW_SECTIONS }, () => BLANK_BUTTON_HALF);
    this.buttonRowRight = Array.from({ length: BUTTON_ROW_SECTIONS }, () => BLANK_BUTTON_HALF);
    this.buttonRowDirty = true;
    this.updatePlayPauseSection();
  }

  private adjustPixelTestLevel(steps: number): void {
    let next = this.pixelTestLevel + steps;
    if (next < 0) next = 0;
    if (next > PIXEL_LEVELS.length - 1) next = PIXEL_LEVELS.length - 1;
    this.pixelTestLevel = next;
    this.applyPixelTestLevel();
  }

  // Fills the whole display (top rows + button row) with the current pixel-test
  // level's fill character and marks everything dirty for the next tick.
  private applyPixelTestLevel(): void {
    const char = PIXEL_LEVELS[this.pixelTestLevel];
    const half = Buffer.alloc(BUTTON_HALF_WIDTH, char);
    this.buttonRowLeft = Array.from({ length: BUTTON_ROW_SECTIONS }, () => half);
    this.buttonRowRight = Array.from({ length: BUTTON_ROW_SECTIONS }, () => half);
    this.buttonRowDirty = true;
    this.topRowDirty = true;
  }

  private updatePlayPauseSection(): void {
    const state = this.lastZoneState?.state;
    const symbol =
      state === 'loading'
        ? this.loadingBlinkPhase
          ? SYMBOL_LOADING
          : SYMBOL_PLAY
        : state === 'playing'
          ? SYMBOL_PAUSE
          : SYMBOL_PLAY;
    this.setButtonSection(1, { left: Buffer.from([symbol, 0x20, 0x20, 0x20]) });
  }

  // Sets one button-row section's left and/or right 4-char half (bytes, not just ASCII —
  // symbols like the play/pause glyphs aren't text) and marks the row dirty for the next
  // tick. `section` is 1-indexed (1-6), matching MidButtonId's section numbering.
  private setButtonSection(section: number, halves: { left?: Buffer; right?: Buffer }): void {
    const index = section - 1;
    if (halves.left) this.buttonRowLeft[index] = halves.left;
    if (halves.right) this.buttonRowRight[index] = halves.right;
    this.buttonRowDirty = true;
  }

  private flushTopRow(): void {
    if (this.topRowMode === 'pixeltest') {
      this.renderPixelTestTopRows();
    } else if (this.topRowMode === 'volume' && this.lastZoneState?.volume) {
      this.renderVolumeOverlay(this.volumeOverlayDst, this.lastZoneState.volume);
    } else if (this.topRowMode === 'now-playing' && this.lastZoneState?.nowPlaying) {
      if (this.nowPlayingMode === 'alternating') {
        this.renderNowPlayingAlternating();
      } else if (this.nowPlayingScrollText.length > 0) {
        this.renderNowPlayingScroll();
      }
    } else {
      this.clearScreen();
    }
  }

  // Builds a full TOP_ROW_WIDTH-byte window into `text` starting at `offset` — right-padded
  // with spaces if `text` is shorter than the row, otherwise a straight slice.
  private buildTopRowWindow(text: Buffer, offset: number): Buffer {
    if (text.length <= TOP_ROW_WIDTH) {
      return Buffer.concat([text, Buffer.alloc(TOP_ROW_WIDTH - text.length, 0x20)]);
    }
    return text.subarray(offset, offset + TOP_ROW_WIDTH);
  }

  // Sends a full TOP_ROW_WIDTH-byte window as the confirmed-working two-message top-row
  // write (11 + 21, both from RAD). Left field uses layout 0x00/flags 0x22; right field
  // uses layout 0xe0/flags 0x80 ("Set cursor"), which continues from the left field
  // instead of starting a new one, so the two together read as one uninterrupted line.
  private sendTopRowWindow(window: Buffer, dstId: IbusDeviceId): void {
    let msg = Buffer.from([0x23, 0x00, 0x22]);
    msg = Buffer.concat([msg, window.subarray(0, TOP_LEFT_WIDTH)]);
    this.ibusInterface.sendMessage(buildMessage(this.id, dstId, msg));

    msg = Buffer.from([0x23, 0xe0, 0x80]);
    msg = Buffer.concat([msg, window.subarray(TOP_LEFT_WIDTH, TOP_ROW_WIDTH)]);
    this.ibusInterface.sendMessage(buildMessage(this.id, dstId, msg));
  }

  private renderPixelTestTopRows(): void {
    const char = PIXEL_LEVELS[this.pixelTestLevel];
    this.sendTopRowWindow(Buffer.alloc(TOP_ROW_WIDTH, char), IbusDeviceId.MID);
  }

  private renderVolumeOverlay(dstId: IbusDeviceId, volume: PlaybackVolume): void {
    const range = volume.max - volume.min || 1;
    const pct = (volume.value - volume.min) / range;

    let progressBarIndex = Math.floor(pct * volumeProgressBars.length);
    if (progressBarIndex >= volumeProgressBars.length) progressBarIndex = volumeProgressBars.length - 1;
    if (progressBarIndex < 0) progressBarIndex = 0;

    const displayValue = Math.round(volume.value).toString().padStart(3, ' ');
    const suffix = volume.type === 'db' ? 'dB' : '%';

    const window = Buffer.concat([
      ascii2paddedHex(`Vol ${displayValue}${suffix}`, TOP_LEFT_WIDTH),
      Buffer.from([0xc6, 0xc8, 0x20]),
      Buffer.from(volumeProgressBars[progressBarIndex]),
      Buffer.from(new Array(8).fill(0x20)),
    ]);
    this.sendTopRowWindow(window, dstId);
  }

  // The single-string "artist <sep> title" scroll style.
  private renderNowPlayingScroll(): void {
    const window = this.buildTopRowWindow(this.nowPlayingScrollText, this.nowPlayingScrollOffset);
    this.sendTopRowWindow(window, IbusDeviceId.MID);
  }

  // The alternating artist/title style: shows one field at a time, static for the
  // first half of its slot and scrolling (if too long) for the second half.
  private renderNowPlayingAlternating(): void {
    const nowPlaying = this.lastZoneState?.nowPlaying;
    if (!nowPlaying) return;
    const text = utf82hex(this.alternatingField === 'artist' ? nowPlaying.artist : nowPlaying.title);
    this.sendTopRowWindow(this.buildTopRowWindow(text, this.alternatingScrollOffset), IbusDeviceId.MID);
  }

  private flushButtonRow(): void {
    // Confirmed via hardware test: the physical row reads section-by-section (left half
    // then right half of each section), NOT all-lefts-then-all-rights. Sections 1-3 go in
    // the "left" message, sections 4-6 in the "right" message — matching docs/MID.js's
    // "Menu - First 3 boxes" / "Menu - Last 3 boxes" comment, which this confirms.
    const sectionValues = (sectionIndexes: number[]): Buffer[] =>
      sectionIndexes.flatMap((i) => [this.buttonRowLeft[i], this.buttonRowRight[i]]);

    const left = Buffer.concat([Buffer.from([0x21, 0x00, 0x15, 0x20]), joinButtonRowHalves(sectionValues([0, 1, 2]))]);
    this.ibusInterface.sendMessage(buildMessage(IbusDeviceId.RAD, IbusDeviceId.MID, left));

    const right = Buffer.concat([Buffer.from([0x21, 0x00, 0x15, 0x06]), joinButtonRowHalves(sectionValues([3, 4, 5]))]);
    this.ibusInterface.sendMessage(buildMessage(IbusDeviceId.RAD, IbusDeviceId.MID, right));
  }

  private clearScreen(): void {
    const msg = Buffer.from([0x23, 0xe0, 0x20]);
    this.ibusInterface.sendMessage(buildMessage(IbusDeviceId.RAD, IbusDeviceId.MID, msg));
  }

  // Dedicated button-row clear opcode (MID::clear() in docs/custom_radio_.../MID.cpp),
  // not a content write — unlike flushButtonRow(), a single send of this doesn't keep
  // the row's backlight active the way writing blank characters does.
  private clearButtonRow(): void {
    const msg = Buffer.from([0x21, 0x00, 0x04, 0x20]);
    this.ibusInterface.sendMessage(buildMessage(IbusDeviceId.RAD, IbusDeviceId.MID, msg));
  }
}

export default RAD;
