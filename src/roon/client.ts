import fs from 'fs';
import RoonApi, { RoonCore } from 'node-roon-api';
import RoonApiTransport, {
  Output,
  Zone,
  ZonesSubscriptionMessage,
  ZonesSubscriptionResponse,
} from 'node-roon-api-transport';
import RoonApiStatus from 'node-roon-api-status';
import Logger from '../lib/log.js';
import { PlaybackZoneState } from '../types/index.js';
import { normalizeZone } from './zone.js';

const EXTENSION_ID = 'com.gyttja.node-bmw-mid';
const DISPLAY_NAME = 'BMW MID';
const DISPLAY_VERSION = '0.0.1';
const PUBLISHER = 'David Füchslin';

const context = 'roon-client';
const log = Logger.get(context);

const readPersistedState = (path: string): Record<string, unknown> => {
  try {
    return JSON.parse(fs.readFileSync(path, 'utf8'));
  } catch {
    return {};
  }
};

const writePersistedState = (path: string, state: Record<string, unknown>): void => {
  fs.writeFileSync(path, JSON.stringify(state, null, 2));
};

type RoonClientConfig = {
  zoneName: string;
  extensionEmail: string;
  persistPath: string;
  onZoneUpdate: (state: PlaybackZoneState) => void;
};

export class RoonClient {
  private readonly zoneName: string;
  private readonly extensionEmail: string;
  private readonly persistPath: string;
  private readonly onZoneUpdate: (state: PlaybackZoneState) => void;
  private roonApi: RoonApi | undefined;
  private status: RoonApiStatus | undefined;
  private transport: RoonApiTransport | undefined;
  private matchedZoneId: string | undefined;
  private matchedOutput: Output | undefined;

  constructor(config: RoonClientConfig) {
    this.zoneName = config.zoneName;
    this.extensionEmail = config.extensionEmail;
    this.persistPath = config.persistPath;
    this.onZoneUpdate = config.onZoneUpdate;
  }

  start(): void {
    this.roonApi = new RoonApi({
      extension_id: EXTENSION_ID,
      display_name: DISPLAY_NAME,
      display_version: DISPLAY_VERSION,
      publisher: PUBLISHER,
      email: this.extensionEmail,
      get_persisted_state: () => readPersistedState(this.persistPath),
      set_persisted_state: (state) => writePersistedState(this.persistPath, state),
      core_paired: (core) => this.onCorePaired(core),
      core_unpaired: () => this.onCoreUnpaired(),
    });

    this.status = new RoonApiStatus(this.roonApi);
    this.roonApi.init_services({
      required_services: [RoonApiTransport],
      provided_services: [this.status],
    });

    this.status.set_status('Waiting for Roon Core...', false);
    this.roonApi.start_discovery();
  }

  changeVolume(steps: number): void {
    if (!this.transport || !this.matchedOutput) {
      log.warn('Cannot change volume: not paired with zone "%s" yet', this.zoneName);
      return;
    }

    this.transport.change_volume(this.matchedOutput, 'relative_step', steps, (err) => {
      if (err) log.error('change_volume failed: %s', err);
    });
  }

  playPause(): void {
    if (!this.transport || !this.matchedZoneId) {
      log.warn('Cannot toggle play/pause: not paired with zone "%s" yet', this.zoneName);
      return;
    }

    this.transport.control(this.matchedZoneId, 'playpause', (err) => {
      if (err) log.error('control(playpause) failed: %s', err);
    });
  }

  stop(): void {
    this.roonApi?.stop_discovery();
  }

  private onCorePaired(core: RoonCore): void {
    log.notice('Paired with Roon Core %s', core.display_name);
    this.status?.set_status(`Paired with ${core.display_name}`, false);

    this.transport = core.services.RoonApiTransport;
    this.transport?.subscribe_zones((response, msg) => this.handleZonesMessage(response, msg));
  }

  private onCoreUnpaired(): void {
    log.warn('Unpaired from Roon Core');
    this.status?.set_status('Waiting for Roon Core...', false);

    this.transport = undefined;
    this.matchedZoneId = undefined;
    this.matchedOutput = undefined;
  }

  private handleZonesMessage(response: ZonesSubscriptionResponse, msg: ZonesSubscriptionMessage): void {
    if (response === 'Unsubscribed') {
      this.matchedZoneId = undefined;
      this.matchedOutput = undefined;
      return;
    }

    if (this.matchedZoneId && msg.zones_removed?.includes(this.matchedZoneId)) {
      this.matchedZoneId = undefined;
      this.matchedOutput = undefined;
    }

    const candidates: Zone[] = [...(msg.zones ?? []), ...(msg.zones_added ?? []), ...(msg.zones_changed ?? [])];
    const zone = candidates.find((z) => z.display_name === this.zoneName);
    if (!zone) return;

    this.matchedZoneId = zone.zone_id;
    this.matchedOutput = zone.outputs[0];
    this.onZoneUpdate(normalizeZone(zone));
  }
}
