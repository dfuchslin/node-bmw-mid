export enum DisplayEvent {
  PixelTestToggled = 'display:pixel-test-toggled',
  CharTestToggled = 'display:char-test-toggled',
  NowPlayingModeChanged = 'display:now-playing-mode-changed',
}

export interface PixelTestTogglePayload {
  enabled: boolean;
}

export interface CharTestTogglePayload {
  enabled: boolean;
}

export type NowPlayingMode = 'scroll' | 'alternating';

export interface NowPlayingModeChangedPayload {
  mode: NowPlayingMode;
}
