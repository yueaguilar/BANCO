const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { createBridgeServer, parseConfig } = require('./bridge');

function makeConfig(queueDirectory) {
    return {
        backendUrl: 'https://bank.example',
        ingestToken: 'test-bridge-ingest-token-with-32-chars',
        deviceToken: 'test-counter-device-token-with-32-chars',
        deviceIds: ['CNT-001'],
        queueDirectory,
        port: 0,
        host: '127.0.0.1'
    };
}

async function startBridge(options = {}) {
    const queueDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'banco-bridge-'));
    const bridge = createBridgeServer({
        config: makeConfig(queueDirectory),
        flushOnIngest: false,
        ...options
    });
    const listening = new Promise((resolve) => bridge.server.once('listening', resolve));
    await bridge.start();
    await listening;
    const { port } = bridge.server.address();
    return {
        bridge,
        queueDirectory,
        url: `http://127.0.0.1:${port}`,
        async cleanup() {
            await bridge.stop();
            await fs.rm(queueDirectory, { recursive: true, force: true });
        }
    };
}

function validBatch() {
    return {
        dispositivo_id: 'CNT-001',
        lote_id: crypto.randomUUID(),
        cantidad_billetes: 20,
        fecha_hora: new Date().toISOString(),
        estado: 'completado'
    };
}

test('bridge requires secure production configuration', () => {
    assert.throws(() => parseConfig({}), /BACKEND_URL.*HTTPS/);
    assert.throws(() => parseConfig({
        BACKEND_URL: 'http://localhost:3000',
        BRIDGE_INGEST_TOKEN: 'x'.repeat(40),
        COUNTER_DEVICE_TOKEN: 'y'.repeat(40),
        COUNTER_DEVICE_IDS: 'CNT-001'
    }), /HTTPS URL/);
});

test('bridge authenticates and durably queues a completed batch idempotently', async () => {
    const running = await startBridge();
    const batch = validBatch();
    const headers = {
        'Content-Type': 'application/json',
        'x-bridge-token': 'test-bridge-ingest-token-with-32-chars'
    };
    try {
        const unauthorized = await fetch(`${running.url}/batches`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(batch)
        });
        assert.equal(unauthorized.status, 401);

        const first = await fetch(`${running.url}/batches`, {
            method: 'POST',
            headers,
            body: JSON.stringify(batch)
        });
        assert.equal(first.status, 202);
        assert.equal((await first.json()).duplicate, false);

        const duplicate = await fetch(`${running.url}/batches`, {
            method: 'POST',
            headers,
            body: JSON.stringify(batch)
        });
        assert.equal(duplicate.status, 202);
        assert.equal((await duplicate.json()).duplicate, true);

        const conflict = await fetch(`${running.url}/batches`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ ...batch, cantidad_billetes: 21 })
        });
        assert.equal(conflict.status, 409);
        assert.equal((await fs.readdir(running.queueDirectory)).filter((name) => name.endsWith('.json')).length, 1);
    } finally {
        await running.cleanup();
    }
});

test('bridge retains offline batches and retries the exact lote_id over HTTPS', async () => {
    const delivered = [];
    let failFirst = true;
    const running = await startBridge({
        fetchImpl: async (url, options) => {
            delivered.push({ url, options });
            if (failFirst) {
                failFirst = false;
                throw new Error('offline');
            }
            return { ok: true, status: 200 };
        }
    });
    const batch = validBatch();

    try {
        const response = await fetch(`${running.url}/batches`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-bridge-token': 'test-bridge-ingest-token-with-32-chars'
            },
            body: JSON.stringify(batch)
        });
        assert.equal(response.status, 202);
        await running.bridge.flushQueue();
        assert.equal((await fs.readdir(running.queueDirectory)).filter((name) => name.endsWith('.json')).length, 1);

        const originalNow = Date.now;
        Date.now = () => originalNow() + 60_000;
        try {
            await running.bridge.flushQueue();
        } finally {
            Date.now = originalNow;
        }

        assert.equal(delivered.length, 2);
        assert.equal(delivered[0].url, 'https://bank.example/api/contador');
        assert.equal(delivered[0].options.headers['x-device-token'], 'test-counter-device-token-with-32-chars');
        assert.equal(JSON.parse(delivered[0].options.body).lote_id, batch.lote_id);
        assert.equal(JSON.parse(delivered[1].options.body).lote_id, batch.lote_id);
        assert.equal((await fs.readdir(running.queueDirectory)).filter((name) => name.endsWith('.json')).length, 0);
    } finally {
        await running.cleanup();
    }
});
