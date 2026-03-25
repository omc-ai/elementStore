/**
 * Base LLM Provider — abstract interface for all providers.
 * Adapted from cwm-architect/backend/src/services/llm/providers/base.ts
 */

class BaseLlmProvider {
    constructor(config) {
        this.config = config;
    }

    /** Provider name (e.g., 'anthropic', 'openai') */
    get name() { return 'base'; }

    /** Check if provider is configured and ready */
    isAvailable() { return !!this.config.apiKey; }

    /** Get default model */
    getDefaultModel() {
        return this.config.model || 'default';
    }

    /**
     * Non-streaming chat completion.
     * @param {Array<{role: string, content: string}>} messages
     * @param {object} options - { model, maxTokens, temperature, systemPrompt }
     * @returns {Promise<{content: string, model: string, usage: object, finishReason: string}>}
     */
    async chat(messages, options) {
        throw new Error('chat() not implemented');
    }

    /**
     * Streaming chat completion.
     * @param {Array} messages
     * @param {object} options
     * @param {object} callbacks - { onChunk(chunk), onComplete(response), onError(error) }
     * @returns {Promise<{content: string, model: string, usage: object, finishReason: string}>}
     */
    async chatStream(messages, options, callbacks) {
        // Default: fall back to non-streaming
        console.warn('[' + this.name + '] Streaming not supported, falling back');
        var response = await this.chat(messages, options);
        callbacks.onChunk({ index: 0, delta: response.content, finishReason: response.finishReason });
        callbacks.onComplete(response);
        return response;
    }
}

module.exports = { BaseLlmProvider: BaseLlmProvider };
