/**
 * LLM Config Store — reads ai:llmConfig objects from ElementStore API.
 * API keys stay server-side, never sent to browsers.
 *
 * Uses Node http module (not fetch) because undici doesn't forward Host header properly.
 */

var http = require('http');
var https = require('https');
var urlMod = require('url');

var ES_API = process.env.ES_API_URL || 'http://agura_web_1/elementStore';
var ES_API_HOST = process.env.ES_API_HOST || 'arc3d.master.local';

// Cache configs for 60 seconds
var cachedConfigs = null;
var cacheTime = 0;
var CACHE_TTL_MS = 60000;

/**
 * HTTP GET with proper Host header
 */
function httpGet(fullUrl) {
    return new Promise(function (resolve, reject) {
        var parsed = new URL(fullUrl);
        var mod = parsed.protocol === 'https:' ? https : http;
        var req = mod.request({
            hostname: parsed.hostname,
            port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
            path: parsed.pathname + parsed.search,
            method: 'GET',
            headers: { 'Host': ES_API_HOST },
        }, function (res) {
            var data = '';
            res.on('data', function (chunk) { data += chunk; });
            res.on('end', function () {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    try { resolve(JSON.parse(data)); }
                    catch (e) { reject(new Error('Invalid JSON: ' + data.substring(0, 100))); }
                } else {
                    reject(new Error('HTTP ' + res.statusCode + ': ' + data.substring(0, 200)));
                }
            });
        });
        req.on('error', reject);
        req.end();
    });
}

/**
 * HTTP POST with proper Host header
 */
function httpPost(fullUrl, body) {
    return new Promise(function (resolve, reject) {
        var parsed = new URL(fullUrl);
        var mod = parsed.protocol === 'https:' ? https : http;
        var jsonBody = JSON.stringify(body);
        var req = mod.request({
            hostname: parsed.hostname,
            port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
            path: parsed.pathname + parsed.search,
            method: 'POST',
            headers: {
                'Host': ES_API_HOST,
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(jsonBody),
            },
        }, function (res) {
            var data = '';
            res.on('data', function (chunk) { data += chunk; });
            res.on('end', function () {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    try { resolve(JSON.parse(data)); }
                    catch (_e) { resolve(data); }
                } else {
                    reject(new Error('HTTP ' + res.statusCode + ': ' + data.substring(0, 200)));
                }
            });
        });
        req.on('error', reject);
        req.write(jsonBody);
        req.end();
    });
}

/**
 * Fetch all ai:llmConfig objects from ElementStore
 */
async function getConfigs() {
    if (cachedConfigs && (Date.now() - cacheTime) < CACHE_TTL_MS) {
        return cachedConfigs;
    }
    try {
        cachedConfigs = await httpGet(ES_API + '/store/ai:llmConfig');
        cacheTime = Date.now();
        return cachedConfigs;
    } catch (e) {
        console.warn('[llm-config] Error fetching configs:', e.message);
        return cachedConfigs || [];
    }
}

/**
 * Get the default LLM config
 */
async function getDefaultConfig() {
    var configs = await getConfigs();
    return configs.find(function (c) { return c.isDefault; })
        || configs.find(function (c) { return c.enabled !== false; })
        || configs[0]
        || null;
}

/**
 * Get a specific config by ID
 */
async function getConfigById(id) {
    var configs = await getConfigs();
    return configs.find(function (c) { return c.id === id; }) || null;
}

/**
 * Get config by provider name
 */
async function getConfigByProvider(provider) {
    var configs = await getConfigs();
    return configs.find(function (c) { return c.provider === provider && c.enabled !== false; }) || null;
}

/**
 * Invalidate cache
 */
function invalidateCache() {
    cachedConfigs = null;
    cacheTime = 0;
}

module.exports = {
    getConfigs: getConfigs,
    getDefaultConfig: getDefaultConfig,
    getConfigById: getConfigById,
    getConfigByProvider: getConfigByProvider,
    invalidateCache: invalidateCache,
    httpPost: httpPost,
};
