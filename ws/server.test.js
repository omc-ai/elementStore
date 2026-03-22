/**
 * WebSocket Server — JWT Authentication Tests
 *
 * Tests for: expired token rejected, tampered payload rejected, missing token rejected.
 * Integration tests using a real WS server on a test port.
 */

'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const http = require('http');
const { WebSocketServer } = require('ws');
const WebSocket = require('ws');
const jwt = require('jsonwebtoken');
const url = require('url');

// ─── Test Configuration ───────────────────────────────────────────────────────

const TEST_SECRET = 'test-secret-for-unit-tests-only';
const TEST_PORT = 3199;

// ─── Minimal WS server (mirrors server.js auth logic) ────────────────────────

function verifyJwtToken(token, secret) {
    if (!token) return null;
    if (!secret) return null;
    try {
        return jwt.verify(token, secret);
    } catch (e) {
        return null;
    }
}

// Spin up a minimal WS server with the same auth logic as server.js
function createTestServer(secret) {
    const server = http.createServer();
    const wss = new WebSocketServer({ server });

    wss.on('connection', function (ws, req) {
        const parsed = url.parse(req.url, true);
        const token = parsed.query.token || null;

        if (!token) {
            ws.send(JSON.stringify({ event: 'error', message: 'Authentication required.' }));
            ws.terminate();
            return;
        }

        const payload = verifyJwtToken(token, secret);
        if (!payload) {
            ws.send(JSON.stringify({ event: 'error', message: 'Invalid or expired token.' }));
            ws.terminate();
            return;
        }

        const userId = payload.sub || payload.user_id || null;
        ws.send(JSON.stringify({ event: 'connected', user_id: userId }));
    });

    return new Promise((resolve) => {
        server.listen(TEST_PORT, '127.0.0.1', () => resolve({ server, wss }));
    });
}

// Helper: connect and collect the first message AND wait for close
function connectAndGetMessage(wsUrl) {
    return new Promise((resolve) => {
        const ws = new WebSocket(wsUrl);
        const result = { message: null, closed: false, code: null };
        let resolved = false;

        function done() {
            if (!resolved) {
                resolved = true;
                resolve(result);
            }
        }

        ws.on('message', (raw) => {
            try {
                result.message = JSON.parse(raw.toString());
            } catch (e) {
                result.message = raw.toString();
            }
            // Don't resolve yet — wait for close so result.closed is accurate
        });

        ws.on('close', (code) => {
            result.closed = true;
            result.code = code;
            done();
        });

        ws.on('error', (err) => {
            result.error = err.message;
            done();
        });

        setTimeout(() => {
            ws.terminate();
            result.timeout = true;
            done();
        }, 3000);
    });
}

// ─── Test suite ───────────────────────────────────────────────────────────────

let testServer = null;

before(async () => {
    testServer = await createTestServer(TEST_SECRET);
});

after(async () => {
    if (testServer) {
        testServer.wss.close();
        await new Promise(resolve => testServer.server.close(resolve));
    }
});

const WS_BASE = `ws://127.0.0.1:${TEST_PORT}`;

// ── Unit tests for verifyJwtToken ────────────────────────────────────────────

describe('verifyJwtToken (unit)', () => {

    test('accepts a valid token', () => {
        const token = jwt.sign({ sub: 'user1', user_id: 'user1' }, TEST_SECRET, { expiresIn: '1h' });
        const payload = verifyJwtToken(token, TEST_SECRET);
        assert.ok(payload, 'should return a payload for a valid token');
        assert.strictEqual(payload.sub, 'user1');
    });

    test('rejects null token', () => {
        const result = verifyJwtToken(null, TEST_SECRET);
        assert.strictEqual(result, null, 'null token should return null');
    });

    test('rejects missing/undefined token', () => {
        const result = verifyJwtToken(undefined, TEST_SECRET);
        assert.strictEqual(result, null, 'undefined token should return null');
    });

    test('rejects expired token', () => {
        const token = jwt.sign(
            { sub: 'user1' },
            TEST_SECRET,
            { expiresIn: -1 }  // already expired
        );
        const result = verifyJwtToken(token, TEST_SECRET);
        assert.strictEqual(result, null, 'expired token should return null');
    });

    test('rejects token signed with wrong secret', () => {
        const token = jwt.sign({ sub: 'attacker' }, 'wrong-secret', { expiresIn: '1h' });
        const result = verifyJwtToken(token, TEST_SECRET);
        assert.strictEqual(result, null, 'token with wrong secret should return null');
    });

    test('rejects tampered payload (base64 swapped)', () => {
        // Sign a token with legitimate data, then manually alter the payload
        const token = jwt.sign({ sub: 'user1', role: 'viewer' }, TEST_SECRET, { expiresIn: '1h' });
        const parts = token.split('.');
        // Replace payload with a forged one claiming admin role
        const forgedPayload = Buffer.from(JSON.stringify({ sub: 'attacker', role: 'admin', exp: 9999999999 })).toString('base64url');
        const tamperedToken = parts[0] + '.' + forgedPayload + '.' + parts[2];
        const result = verifyJwtToken(tamperedToken, TEST_SECRET);
        assert.strictEqual(result, null, 'tampered payload should fail signature check');
    });

    test('rejects token with alg:none attack', () => {
        // Attempt alg:none bypass: forged header with alg=none, no signature
        const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
        const payload = Buffer.from(JSON.stringify({ sub: 'attacker', exp: 9999999999 })).toString('base64url');
        const noneToken = header + '.' + payload + '.';
        const result = verifyJwtToken(noneToken, TEST_SECRET);
        assert.strictEqual(result, null, 'alg:none token must be rejected');
    });

    test('rejects when JWT_SECRET is null (unconfigured)', () => {
        const token = jwt.sign({ sub: 'user1' }, TEST_SECRET, { expiresIn: '1h' });
        const result = verifyJwtToken(token, null);
        assert.strictEqual(result, null, 'null secret should reject all tokens');
    });

});

// ── Integration tests (WS connection) ────────────────────────────────────────

describe('WebSocket connection authentication (integration)', () => {

    test('accepts connection with valid JWT', async () => {
        const token = jwt.sign({ sub: 'user42' }, TEST_SECRET, { expiresIn: '1h' });
        const result = await connectAndGetMessage(`${WS_BASE}/?token=${token}`);
        assert.ok(result.message, 'should receive a message');
        assert.strictEqual(result.message.event, 'connected', 'should confirm connection');
        assert.strictEqual(result.message.user_id, 'user42');
    });

    test('rejects connection with no token', async () => {
        const result = await connectAndGetMessage(`${WS_BASE}/`);
        assert.ok(result.message, 'should receive error message');
        assert.strictEqual(result.message.event, 'error');
        assert.match(result.message.message, /Authentication required/i, 'error should mention authentication');
    });

    test('rejects connection with expired token', async () => {
        const token = jwt.sign({ sub: 'user1' }, TEST_SECRET, { expiresIn: -1 });
        const result = await connectAndGetMessage(`${WS_BASE}/?token=${token}`);
        assert.ok(result.message, 'should receive error message');
        assert.strictEqual(result.message.event, 'error');
        assert.match(result.message.message, /Invalid or expired/i);
    });

    test('rejects connection with tampered JWT payload', async () => {
        const token = jwt.sign({ sub: 'user1' }, TEST_SECRET, { expiresIn: '1h' });
        const parts = token.split('.');
        const forgedPayload = Buffer.from(JSON.stringify({ sub: 'admin', exp: 9999999999 })).toString('base64url');
        const tamperedToken = parts[0] + '.' + forgedPayload + '.' + parts[2];
        const result = await connectAndGetMessage(`${WS_BASE}/?token=${tamperedToken}`);
        assert.ok(result.message, 'should receive error message');
        assert.strictEqual(result.message.event, 'error');
        assert.match(result.message.message, /Invalid or expired/i);
    });

    test('rejects connection with wrong secret', async () => {
        const token = jwt.sign({ sub: 'attacker' }, 'different-secret', { expiresIn: '1h' });
        const result = await connectAndGetMessage(`${WS_BASE}/?token=${token}`);
        assert.ok(result.message, 'should receive error message');
        assert.strictEqual(result.message.event, 'error');
        assert.match(result.message.message, /Invalid or expired/i);
    });

    test('rejects alg:none token', async () => {
        const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
        const payload = Buffer.from(JSON.stringify({ sub: 'attacker', exp: 9999999999 })).toString('base64url');
        const noneToken = header + '.' + payload + '.';
        const result = await connectAndGetMessage(`${WS_BASE}/?token=${noneToken}`);
        assert.ok(result.message, 'should receive error message');
        assert.strictEqual(result.message.event, 'error');
    });

    test('connection is terminated after rejection (not left open)', async () => {
        const result = await connectAndGetMessage(`${WS_BASE}/`);
        assert.ok(result.closed, 'connection should be closed after rejection');
    });

});
