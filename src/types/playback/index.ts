export enum PlaybackEvent {
  VolumeChangeRequested = 'playback:volume-change-requested',
  PlayPauseRequested = 'playback:play-pause-requested',
  PauseRequested = 'playback:pause-requested',
  ZoneUpdated = 'playback:zone-updated',
}

export interface VolumeChangeRequestPayload {
  steps: number;
}

export interface PlaybackVolume {
  value: number;
  min: number;
  max: number;
  isMuted: boolean;
  type: 'db' | 'number';
}

export interface NowPlaying {
  title: string;
  artist: string;
  album: string;
}

export interface PlaybackZoneState {
  state: 'playing' | 'paused' | 'stopped' | 'loading';
  volume: PlaybackVolume | null;
  nowPlaying: NowPlaying | null;
}
