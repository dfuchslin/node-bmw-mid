declare module 'node-roon-api-transport' {
  export interface Volume {
    type?: string;
    min?: number;
    max?: number;
    value?: number;
    step?: number;
    is_muted?: boolean;
  }

  export interface Output {
    output_id: string;
    zone_id: string;
    display_name: string;
    volume?: Volume;
  }

  export interface NowPlayingLines {
    line1: string;
    line2?: string;
    line3?: string;
  }

  export interface Zone {
    zone_id: string;
    display_name: string;
    outputs: Output[];
    state: 'playing' | 'paused' | 'loading' | 'stopped';
    now_playing?: {
      three_line: NowPlayingLines;
    };
  }

  export interface ZonesSubscriptionMessage {
    zones?: Zone[];
    zones_added?: Zone[];
    zones_removed?: string[];
    zones_changed?: Zone[];
  }

  export type ZonesSubscriptionResponse = 'Subscribed' | 'Changed' | 'Unsubscribed';

  export default class RoonApiTransport {
    static services: { name: string }[];
    constructor(core: unknown);
    subscribe_zones(cb: (response: ZonesSubscriptionResponse, msg: ZonesSubscriptionMessage) => void): void;
    change_volume(
      output: Output,
      how: 'absolute' | 'relative' | 'relative_step',
      value: number,
      cb?: (error: string | false) => void,
    ): void;
    control(
      zoneOrOutput: string | Zone | Output,
      control: 'play' | 'pause' | 'playpause' | 'stop' | 'previous' | 'next',
      cb?: (error: string | false) => void,
    ): void;
  }
}

declare module 'node-roon-api-status' {
  export default class RoonApiStatus {
    services: { name: string }[];
    constructor(roon: unknown);
    set_status(message: string, isError?: boolean): void;
  }
}

declare module 'node-roon-api' {
  export interface RoonCore {
    core_id: string;
    display_name: string;
    services: {
      RoonApiTransport?: import('node-roon-api-transport').default;
    };
  }

  export interface RoonExtensionDesc {
    extension_id: string;
    display_name: string;
    display_version: string;
    publisher: string;
    email: string;
    website?: string;
    log_level?: 'all' | 'none';
    core_paired?: (core: RoonCore) => void;
    core_unpaired?: (core: RoonCore) => void;
    set_persisted_state?: (state: Record<string, unknown>) => void;
    get_persisted_state?: () => Record<string, unknown>;
  }

  export interface RoonServiceProvider {
    services: { name: string }[];
  }

  export default class RoonApi {
    constructor(desc: RoonExtensionDesc);
    init_services(opts: {
      required_services?: RoonServiceProvider[];
      optional_services?: RoonServiceProvider[];
      provided_services?: RoonServiceProvider[];
    }): void;
    start_discovery(): void;
    stop_discovery(): void;
  }
}
