const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');

const MAX_BODY_BYTES = 16 * 1024;
const MAX_RETRY_DELAY_MS = 5 * 60 * 1000;

function parseConfig(env = process.env) {
    const backendUrl = String(env.BACKEND_URL || '').trim().replace(/\/+$/, '');
    const ingestToken = String(env.BRIDGE_INGEST_TOKEN || '');
    const deviceToken = String(env.COUNTER_DEVICE_TOKEN || '');
    const deviceIds = [...new Set(String(env.COUNTER_DEVICE_IDS || '')
        .split(',')
        .map((deviceId) => deviceId.trim())
        .filter(Boolean))];
    const queueDirectory = String(env.COUNTER_QUEUE_DIR || path.join(__dirname, 'queue'));
    const port = Number(env.BRIDGE_PORT || 8080);
    const host = String(env.BRIDGE_HOST || '0.0.0.0');
    const errors = [];

    try {
        const parsedUrl = new URL(backendUrl);
        if (parsedUrl.protocol !== 'https:' || parsedUrl.username || parsedUrl.password) {
            errors.push('BACKEND_URL must be an HTTPS URL without embedded credentials');
        }
    } catch {
        errors.push('BACKEND_URL must be a valid HTTPS URL');
    }
    if (ingestToken.length < 32) errors.push('BRIDGE_INGEST_TOKEN must be at least 32 characters');
    if (deviceToken.length < 32) errors.push('COUNTER_DEVICE_TOKEN must be at least 32 characters');
    if (deviceIds.length === 0 || deviceIds.some((id) => !/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(id))) {
        errors.push('COUNTER_DEVICE_IDS must contain valid authorized device IDs');
    }
    if (!Number.isInteger(port) || port < 1 || port > 65535) errors.push('BRIDGE_PORT must be a valid TCP port');
    if (errors.length > 0) throw new Error(errors.join('; '));

    return { backendUrl, ingestToken, deviceToken, deviceIds, queueDirectory, port, host };
}

function secureEquals(expected, provided) {
    const left = Buffer.from(expected);
    const right = Buffer.from(provided);
    return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function validateBatch(body, deviceIds) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        return 'The batch must be a JSON object';
    }
    if (typeof body.dispositivo_id !== 'string' || !deviceIds.includes(body.dispositivo_id)) {
        return 'The device is not authorized';
    }
    if (typeof body.lote_id !== 'string'
        || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.lote_id)) {
        return 'lote_id must be a stable UUID';
    }
    if (!Number.isSafeInteger(body.cantidad_billetes) || body.cantidad_billetes < 1 || body.cantidad_billetes > 10000) {
        return 'cantidad_billetes must be an integer between 1 and 10000';
    }
    if (body.estado !== 'completado') return 'Only completed counts can be queued';
    const timestamp = new Date(body.fecha_hora);
    if (typeof body.fecha_hora !== 'string' || Number.isNaN(timestamp.getTime())) return 'fecha_hora must be a valid timestamp';
    if (timestamp.getTime() > Date.now() + 5 * 60 * 1000) return 'fecha_hora cannot be in the future';
    return null;
}

function sameBatch(left, right) {
    return left.dispositivo_id === right.dispositivo_id
        && left.lote_id === right.lote_id
        && left.cantidad_billetes === right.cantidad_billetes
        && left.estado === right.estado;
}

function sendJson(res, statusCode, body) {
    res.writeHead(statusCode, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store'
    });
    res.end(JSON.stringify(body));
}

async function readJsonBody(req) {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
        size += chunk.length;
        if (size > MAX_BODY_BYTES) {
            const error = new Error('Request body too large');
            error.statusCode = 413;
            throw error;
        }
        chunks.push(chunk);
    }
    try {
        return JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
        const error = new Error('Invalid JSON');
        error.statusCode = 400;
        throw error;
    }
}

function createBridgeServer({
    config = parseConfig(),
    fetchImpl = globalThis.fetch,
    retryIntervalMs = 2000,
    flushOnIngest = true
} = {}) {
    const processing = new Set();
    let retryTimer;

    async function forwardDeposit(req, res, payload, backendPath) {
        if (typeof payload.dispositivo_id !== 'string' || !config.deviceIds.includes(payload.dispositivo_id)) {
            return sendJson(res, 403, { success: false, message: 'The device is not authorized.' });
        }

        try {
            const headers = {
                'Content-Type': 'application/json',
                'x-device-token': config.deviceToken
            };
            const authorization = req.headers.authorization;
            if (typeof authorization === 'string') headers.Authorization = authorization;
            const response = await fetchImpl(`${config.backendUrl}${backendPath}`, {
                method: 'POST',
                headers,
                body: JSON.stringify(payload),
                signal: AbortSignal.timeout(10_000)
            });
            let result;
            try {
                result = await response.json();
            } catch {
                result = { success: false, message: 'The backend returned an invalid response.' };
            }
            const decision = result && typeof result === 'object' && !Array.isArray(result)
                ? { ...result, accepted: response.ok && result.success === true }
                : { success: false, accepted: false, message: 'The backend returned an invalid response.' };
            return sendJson(res, response.status, decision);
        } catch {
            return sendJson(res, 502, {
                success: false,
                accepted: false,
                message: 'The backend could not be reached; retry with the same operation ID.'
            });
        }
    }

    function batchPath(loteId) {
        return path.join(config.queueDirectory, `${loteId}.json`);
    }

    async function writeRecord(filePath, record) {
        const tempPath = `${filePath}.${crypto.randomUUID()}.tmp`;
        try {
            const handle = await fs.open(tempPath, 'wx', 0o600);
            try {
                await handle.writeFile(JSON.stringify(record));
                await handle.sync();
            } finally {
                await handle.close();
            }
            await fs.rename(tempPath, filePath);
        } catch (error) {
            await fs.rm(tempPath, { force: true });
            throw error;
        }
    }

    async function writeNewRecord(filePath, record) {
        const tempPath = `${filePath}.${crypto.randomUUID()}.tmp`;
        try {
            const handle = await fs.open(tempPath, 'wx', 0o600);
            try {
                await handle.writeFile(JSON.stringify(record));
                await handle.sync();
            } finally {
                await handle.close();
            }
            await fs.link(tempPath, filePath);
        } finally {
            await fs.rm(tempPath, { force: true });
        }
    }

    async function enqueue(payload) {
        const filePath = batchPath(payload.lote_id);
        try {
            const existing = JSON.parse(await fs.readFile(filePath, 'utf8'));
            if (!sameBatch(existing.payload, payload) || existing.status === 'rejected') {
                return { conflict: true };
            }
            return { duplicate: true };
        } catch (error) {
            if (error.code !== 'ENOENT') throw error;
        }

        const record = {
            payload,
            attempts: 0,
            nextAttemptAt: 0,
            status: 'pending'
        };
        try {
            await writeNewRecord(filePath, record);
            return { duplicate: false };
        } catch (error) {
            if (error.code !== 'EEXIST') throw error;
            const existing = JSON.parse(await fs.readFile(filePath, 'utf8'));
            if (!sameBatch(existing.payload, payload) || existing.status === 'rejected') {
                return { conflict: true };
            }
            return { duplicate: true };
        }
    }

    async function deliver(filePath) {
        if (processing.has(filePath)) return;
        processing.add(filePath);
        try {
            const record = JSON.parse(await fs.readFile(filePath, 'utf8'));
            if (record.status !== 'pending' || record.nextAttemptAt > Date.now()) return;

            let response;
            try {
                response = await fetchImpl(`${config.backendUrl}/api/contador`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-device-token': config.deviceToken
                    },
                    body: JSON.stringify(record.payload),
                    signal: AbortSignal.timeout(10_000)
                });
            } catch {
                record.attempts += 1;
                record.nextAttemptAt = Date.now() + Math.min(
                    MAX_RETRY_DELAY_MS,
                    1000 * (2 ** Math.min(record.attempts, 8))
                );
                await writeRecord(filePath, record);
                return;
            }

            if (response.ok) {
                await fs.rm(filePath, { force: true });
                return;
            }

            if (response.status >= 400 && response.status < 500 && response.status !== 408 && response.status !== 429) {
                record.status = 'rejected';
                record.lastStatus = response.status;
                console.error(`Backend rejected counter batch ${record.payload.lote_id} with HTTP ${response.status}.`);
            } else {
                record.attempts += 1;
                record.nextAttemptAt = Date.now() + Math.min(
                    MAX_RETRY_DELAY_MS,
                    1000 * (2 ** Math.min(record.attempts, 8))
                );
            }
            await writeRecord(filePath, record);
        } finally {
            processing.delete(filePath);
        }
    }

    async function flushQueue() {
        await fs.mkdir(config.queueDirectory, { recursive: true, mode: 0o700 });
        const names = await fs.readdir(config.queueDirectory);
        await Promise.all(names
            .filter((name) => /^[0-9a-f-]{36}\.json$/i.test(name))
            .map((name) => deliver(path.join(config.queueDirectory, name))));
    }

    async function handleRequest(req, res) {
        const url = new URL(req.url, 'http://localhost');
        if (req.method === 'GET' && url.pathname === '/health') {
            await fs.mkdir(config.queueDirectory, { recursive: true, mode: 0o700 });
            const names = await fs.readdir(config.queueDirectory);
            const batchFiles = names.filter((name) => /^[0-9a-f-]{36}\.json$/i.test(name));
            let pending = 0;
            let rejected = 0;
            for (const name of batchFiles) {
                const record = JSON.parse(await fs.readFile(path.join(config.queueDirectory, name), 'utf8'));
                if (record.status === 'rejected') rejected += 1;
                else pending += 1;
            }
            return sendJson(res, 200, { success: true, pending, rejected });
        }
        const depositRoutes = {
            '/depositos/autenticar': '/api/contador/depositos/autenticar',
            '/depositos/preparar': '/api/contador/depositos/preparar',
            '/depositos/confirmar': '/api/contador/depositos/confirmar'
        };
        if (req.method === 'POST' && Object.hasOwn(depositRoutes, url.pathname)) {
            if (!secureEquals(config.ingestToken, req.headers['x-bridge-token'] || '')) {
                return sendJson(res, 401, { success: false, accepted: false, message: 'Bridge authentication required.' });
            }
            let payload;
            try {
                payload = await readJsonBody(req);
            } catch (error) {
                return sendJson(res, error.statusCode || 400, {
                    success: false,
                    accepted: false,
                    message: error.statusCode === 413 ? 'Request body too large.' : 'Invalid JSON body.'
                });
            }
            if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
                return sendJson(res, 400, { success: false, accepted: false, message: 'Expected a JSON object.' });
            }
            return forwardDeposit(req, res, payload, depositRoutes[url.pathname]);
        }
        if (req.method !== 'POST' || url.pathname !== '/batches') {
            return sendJson(res, 404, { success: false, message: 'Route not found.' });
        }
        if (!secureEquals(config.ingestToken, req.headers['x-bridge-token'] || '')) {
            return sendJson(res, 401, { success: false, message: 'Bridge authentication required.' });
        }

        let payload;
        try {
            payload = await readJsonBody(req);
        } catch (error) {
            return sendJson(res, error.statusCode || 400, {
                success: false,
                message: error.statusCode === 413 ? 'Request body too large.' : 'Invalid JSON body.'
            });
        }
        const validationError = validateBatch(payload, config.deviceIds);
        if (validationError) return sendJson(res, 400, { success: false, message: validationError });

        try {
            const result = await enqueue(payload);
            if (result.conflict) {
                return sendJson(res, 409, { success: false, message: 'The lote_id already exists with different batch data.' });
            }
            if (flushOnIngest) void deliver(batchPath(payload.lote_id));
            return sendJson(res, 202, {
                success: true,
                duplicate: result.duplicate,
                lote_id: payload.lote_id,
                message: 'Batch safely queued for backend delivery.'
            });
        } catch (error) {
            console.error('Unable to persist the counter batch.');
            return sendJson(res, 500, { success: false, message: 'Unable to persist the batch.' });
        }
    }

    const server = http.createServer((req, res) => {
        void handleRequest(req, res).catch((error) => {
            console.error('Bridge request failed:', error.message);
            if (!res.headersSent) sendJson(res, 500, { success: false, message: 'Internal bridge error.' });
            else res.destroy();
        });
    });

    return {
        server,
        flushQueue,
        async start() {
            await fs.mkdir(config.queueDirectory, { recursive: true, mode: 0o700 });
            await fs.chmod(config.queueDirectory, 0o700);
            server.listen(config.port, config.host);
            retryTimer = setInterval(() => {
                void flushQueue().catch((error) => console.error('Queue retry failed:', error.message));
            }, retryIntervalMs);
            retryTimer.unref();
            void flushQueue().catch((error) => console.error('Initial queue delivery failed:', error.message));
        },
        async stop() {
            clearInterval(retryTimer);
            if (server.listening) {
                await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
            }
        }
    };
}

if (require.main === module) {
    try {
        const bridge = createBridgeServer();
        bridge.start();
        bridge.server.on('listening', () => {
            console.log(`Ubuntu counter bridge listening on ${process.env.BRIDGE_HOST || '0.0.0.0'}:${process.env.BRIDGE_PORT || 8080}`);
        });
        for (const signal of ['SIGINT', 'SIGTERM']) {
            process.on(signal, () => void bridge.stop().then(() => process.exit(0)));
        }
    } catch (error) {
        console.error(`Bridge configuration error: ${error.message}`);
        process.exitCode = 1;
    }
}

module.exports = { createBridgeServer, parseConfig, validateBatch };
