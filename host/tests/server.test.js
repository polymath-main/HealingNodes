const { test } = require('node:test');
const assert = require('node:assert');
const { SyncServer } = require('../src/server');
const WebSocket = require('ws');
const { performance } = require('perf_hooks');

test('Server initializes and responds to NTP sync', async () => {
    const server = new SyncServer(8081);
    await server.start();

    const ws = new WebSocket('ws://localhost:8081');

    await new Promise((resolve) => ws.on('open', resolve));

    const t0 = performance.timeOrigin + performance.now();
    ws.send(JSON.stringify({ type: 'ntp_sync', t0 }));

    const message = await new Promise((resolve) => {
        ws.on('message', (data) => resolve(data.toString()));
    });

    const parsed = JSON.parse(message);
    assert.strictEqual(parsed.type, 'ntp_sync_reply');
    assert.strictEqual(parsed.t0, t0);
    assert.ok(parsed.t1 >= t0);
    assert.ok(parsed.t2 >= parsed.t1);

    ws.close();
    await server.stop();
});
