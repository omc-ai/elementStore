/**
 * LLM Provider Registry — creates provider instances from ai:llmConfig objects.
 */

var configStore = require('./config-store.js');
var OpenAICompatibleProvider = require('./openai-provider.js').OpenAICompatibleProvider;
var AnthropicProvider = require('./anthropic-provider.js').AnthropicProvider;
var HuggingFaceProvider = require('./hf-provider.js').HuggingFaceProvider;

// Provider cache: config.id → provider instance
var providerCache = new Map();

/**
 * Create a provider from an ai:llmConfig object
 */
function createProvider(config) {
    if (!config || !config.provider) return null;

    // Check if "custom" provider with baseUrl="huggingface" → use HF provider
    var effectiveProvider = config.provider;
    if (config.provider === 'custom' && config.baseUrl === 'huggingface') {
        effectiveProvider = 'huggingface';
    }

    switch (effectiveProvider) {
        case 'anthropic':
            return new AnthropicProvider(config);
        case 'huggingface':
            return new HuggingFaceProvider(config);
        case 'openai':
        case 'xai':
        case 'azure':
        case 'google':
        case 'custom':
            return new OpenAICompatibleProvider(config);
        default:
            console.warn('[llm] Unknown provider:', effectiveProvider);
            return new OpenAICompatibleProvider(config);
    }
}

/**
 * Get a provider instance by config ID (cached)
 */
async function getProvider(configId) {
    if (configId && providerCache.has(configId)) {
        return providerCache.get(configId);
    }

    var config;
    if (configId) {
        config = await configStore.getConfigById(configId);
    } else {
        config = await configStore.getDefaultConfig();
    }

    if (!config) return null;

    var provider = createProvider(config);
    if (provider && config.id) {
        providerCache.set(config.id, provider);
    }
    return provider;
}

/**
 * Get the default provider
 */
async function getDefaultProvider() {
    return getProvider(null);
}

/**
 * List available providers
 */
async function listProviders() {
    var configs = await configStore.getConfigs();
    return configs.map(function (c) {
        return {
            id: c.id,
            name: c.name,
            provider: c.provider,
            model: c.model,
            enabled: c.enabled !== false,
            isDefault: !!c.isDefault,
        };
    });
}

/**
 * Clear provider cache (e.g., after config changes)
 */
function clearCache() {
    providerCache.clear();
    configStore.invalidateCache();
}

module.exports = {
    getProvider: getProvider,
    getDefaultProvider: getDefaultProvider,
    listProviders: listProviders,
    clearCache: clearCache,
    createProvider: createProvider,
};
