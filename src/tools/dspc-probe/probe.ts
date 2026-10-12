import { Ant } from './ant.js';
import { BridgeClient } from './bridge-client.js';
import { probeConfig } from './config.js';
import { KeepAlive } from './keepalive.js';
import { Liveness } from './liveness.js';
import { Recorder } from './recorder.js';
import { Responders } from './responders.js';

export type Probe = {
  bridge: BridgeClient;
  recorder: Recorder;
  ant: Ant;
  keepAlive: KeepAlive;
  responders: Responders;
  liveness: Liveness;
  term: () => Promise<void>;
};

export const createProbe = async (name: string, { gpio = true } = {}): Promise<Probe> => {
  const recorder = new Recorder(probeConfig.logDir, name);
  const bridge = new BridgeClient();
  recorder.attach(bridge);
  await bridge.connect(probeConfig.bridge.host, probeConfig.bridge.port);

  const ant = new Ant(recorder);
  if (gpio) {
    await ant.init(probeConfig.gpio.host, probeConfig.gpio.pins);
  }
  const keepAlive = new KeepAlive(bridge, recorder);
  const responders = new Responders(bridge, recorder);
  const liveness = new Liveness(bridge, recorder);
  recorder.record('probeStart', { name, argv: process.argv.slice(2), config: probeConfig });

  const term = async () => {
    keepAlive.stop();
    ant.term();
    // give queued frames a moment to reach the bus before disconnecting
    await new Promise((resolve) => setTimeout(resolve, 200));
    bridge.close();
    await recorder.close();
  };

  return { bridge, recorder, ant, keepAlive, responders, liveness, term };
};
