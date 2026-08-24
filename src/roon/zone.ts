import type { Zone } from 'node-roon-api-transport';
import { PlaybackZoneState } from '../types/index.js';

export const normalizeZone = (zone: Zone): PlaybackZoneState => {
  const volume = zone.outputs[0]?.volume;
  const nowPlayingLines = zone.now_playing?.three_line;

  return {
    state: zone.state,
    volume:
      volume?.value !== undefined && volume.min !== undefined && volume.max !== undefined
        ? { value: volume.value, min: volume.min, max: volume.max, isMuted: volume.is_muted ?? false }
        : null,
    nowPlaying: nowPlayingLines
      ? {
          title: nowPlayingLines.line1 ?? '',
          artist: nowPlayingLines.line2 ?? '',
          album: nowPlayingLines.line3 ?? '',
        }
      : null,
  };
};
