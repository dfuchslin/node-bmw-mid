import Logger from '../lib/log.js';
import { config } from '../config.js';
import { EventBus } from '../eventbus/index.js';
import { PlaybackEvent, PlaybackZoneState, VolumeChangeRequestPayload } from '../types/index.js';
import { RoonClient } from './client.js';

const context = 'roon';
const log = Logger.get(context);

let client: RoonClient | undefined;

const init = async (eventBus: EventBus) => {
  eventBus.on(PlaybackEvent.VolumeChangeRequested, ({ steps }: VolumeChangeRequestPayload) => {
    client?.changeVolume(steps);
  });
  eventBus.on(PlaybackEvent.PlayPauseRequested, () => client?.playPause());
  eventBus.on(PlaybackEvent.PauseRequested, () => client?.pause());

  try {
    client = new RoonClient({
      zoneName: config.roon.zoneName,
      extensionEmail: config.roon.extensionEmail,
      persistPath: config.roon.persistPath,
      onZoneUpdate: (state: PlaybackZoneState) => eventBus.emit(PlaybackEvent.ZoneUpdated, state, { context }),
    });
    client.start();
    log.notice('Roon extension started, waiting for Core pairing');
  } catch (err) {
    log.error('Could not start Roon extension', err);
  }
};

const term = async () => {
  log.notice('Shutting down Roon extension');
  client?.stop();
};

export default { init, term };
