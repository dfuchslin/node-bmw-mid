import net from 'node:net';
import readline from 'node:readline';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { IbusBridgeClient } from '../../../src/lib/ibus/IbusBridgeClient.js';
import { FullIbusMessage } from '../../../src/types/index.js';

// A stand-in for src/ibus-bridge.ts: records lines from the client and lets the test push lines back.
const startFakeBridge = async (port = 0) => {
  const lines: string[] = [];
  const sockets = new Set<net.Socket>();
  const server = net.createServer((socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    readline.createInterface({ input: socket }).on('line', (line) => lines.push(line));
  });
  await new Promise<void>((resolve) => server.listen(port, '127.0.0.1', resolve));
  return {
    port: (server.address() as net.AddressInfo).port,
    lines,
    push: (event: Record<string, unknown>) =>
      sockets.forEach((s) => s.write(JSON.stringify({ t: 1000, ...event }) + '\n')),
    close: () =>
      new Promise<void>((resolve) => {
        sockets.forEach((s) => s.destroy());
        server.close(() => resolve());
      }),
  };
};

let cleanup: (() => Promise<void>)[] = [];
afterEach(async () => {
  await Promise.all(cleanup.map((fn) => fn()));
  cleanup = [];
});

const connectedClient = async (port: number) => {
  const client = new IbusBridgeClient('127.0.0.1', port);
  client.startup();
  cleanup.push(() => new Promise((resolve) => client.shutdown(resolve)));
  await vi.waitFor(() => expect(client.isConnected()).toBe(true));
  return client;
};

describe('IbusBridgeClient', () => {
  test('rx and echo frames are emitted as data', async () => {
    const bridge = await startFakeBridge();
    cleanup.push(bridge.close);
    const client = await connectedClient(bridge.port);
    const received: FullIbusMessage[] = [];
    client.on('data', (message) => received.push(message));

    bridge.push({ type: 'hello', path: '/dev/ttyUSB0' });
    bridge.push({ type: 'raw', hex: '68 04 FF 36 AF 0A' });
    bridge.push({ type: 'rx', hex: '68 04 FF 36 AF 0A' });
    bridge.push({ type: 'echo', hex: '3F 03 EA 00 D6' });

    await vi.waitFor(() => expect(received).toHaveLength(2));
    expect(received[0]).toStrictEqual({
      src: 0x68,
      dst: 0xff,
      msg: Buffer.from([0x36, 0xaf]),
      id: 1000,
      len: 0x04,
      crc: 0x0a,
    });
    expect(received[1]).toMatchObject({ src: 0x3f, dst: 0xea, msg: Buffer.from([0x00]), len: 0x03, crc: 0xd6 });
  });

  test('sendMessage writes a tx line with the full frame', async () => {
    const bridge = await startFakeBridge();
    cleanup.push(bridge.close);
    const client = await connectedClient(bridge.port);

    client.sendMessage({ src: 0x68, dst: 0xff, msg: Buffer.from([0x36, 0xaf]) });

    await vi.waitFor(() => expect(bridge.lines).toStrictEqual(['{"tx":"68 04 FF 36 AF 0A"}']));
  });

  test('frames sent while disconnected are dropped, and the client reconnects', async () => {
    const bridge = await startFakeBridge();
    const { port } = bridge;
    const client = await connectedClient(port);
    await bridge.close();
    await vi.waitFor(() => expect(client.isConnected()).toBe(false));

    client.sendMessage({ src: 0x68, dst: 0xff, msg: Buffer.from([0x36, 0xaf]) });

    const restarted = await startFakeBridge(port);
    cleanup.push(restarted.close);
    await vi.waitFor(() => expect(client.isConnected()).toBe(true), { timeout: 3000 });
    client.sendMessage({ src: 0x3f, dst: 0xea, msg: Buffer.from([0x00]) });

    await vi.waitFor(() => expect(restarted.lines).toStrictEqual(['{"tx":"3F 03 EA 00 D6"}']));
  });
});
