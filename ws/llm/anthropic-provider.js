/**
 * Anthropic Claude Provider — streaming chat via the Anthropic SDK.
 * Adapted from cwm-architect's claude.ts provider.
 */

var BaseLlmProvider = require('./base-provider.js').BaseLlmProvider;

class AnthropicProvider extends BaseLlmProvider {
    constructor(config) {
        super(config);
        // Lazy-load SDK (may not be installed)
        try {
            var Anthropic = require('@anthropic-ai/sdk');
            this.client = new Anthropic({ apiKey: config.apiKey });
        } catch (e) {
            console.warn('[anthropic] SDK not installed, provider unavailable');
            this.client = null;
        }
    }

    get name() { return 'anthropic'; }

    isAvailable() {
        return !!this.client && !!this.config.apiKey;
    }

    async chat(messages, options) {
        if (!this.client) throw new Error('Anthropic SDK not available');

        var model = (options && options.model) || this.config.model || 'claude-sonnet-4-5-20250929';
        var maxTokens = (options && options.maxTokens) || 4096;

        // Separate system prompt from messages
        var systemPrompt = (options && options.systemPrompt) || '';
        var anthropicMessages = [];
        for (var i = 0; i < messages.length; i++) {
            var msg = messages[i];
            if (msg.role === 'system') {
                systemPrompt = (systemPrompt ? systemPrompt + '\n' : '') + msg.content;
            } else {
                anthropicMessages.push({ role: msg.role, content: msg.content });
            }
        }

        var params = {
            model: model,
            max_tokens: maxTokens,
            messages: anthropicMessages,
        };
        if (systemPrompt) params.system = systemPrompt;
        if (options && options.temperature != null) params.temperature = options.temperature;

        var response = await this.client.messages.create(params);

        var content = '';
        if (response.content) {
            for (var j = 0; j < response.content.length; j++) {
                if (response.content[j].type === 'text') {
                    content += response.content[j].text;
                }
            }
        }

        return {
            content: content,
            model: response.model || model,
            provider: 'anthropic',
            usage: {
                inputTokens: response.usage ? response.usage.input_tokens : 0,
                outputTokens: response.usage ? response.usage.output_tokens : 0,
                totalTokens: response.usage ? (response.usage.input_tokens + response.usage.output_tokens) : 0,
            },
            finishReason: response.stop_reason || 'end_turn',
        };
    }

    async chatStream(messages, options, callbacks) {
        if (!this.client) throw new Error('Anthropic SDK not available');

        var model = (options && options.model) || this.config.model || 'claude-sonnet-4-5-20250929';
        var maxTokens = (options && options.maxTokens) || 4096;

        // Separate system prompt
        var systemPrompt = (options && options.systemPrompt) || '';
        var anthropicMessages = [];
        for (var i = 0; i < messages.length; i++) {
            var msg = messages[i];
            if (msg.role === 'system') {
                systemPrompt = (systemPrompt ? systemPrompt + '\n' : '') + msg.content;
            } else {
                anthropicMessages.push({ role: msg.role, content: msg.content });
            }
        }

        var params = {
            model: model,
            max_tokens: maxTokens,
            messages: anthropicMessages,
        };
        if (systemPrompt) params.system = systemPrompt;
        if (options && options.temperature != null) params.temperature = options.temperature;

        var fullContent = '';
        var chunkIndex = 0;
        var inputTokens = 0;
        var outputTokens = 0;
        var finishReason = 'end_turn';

        try {
            var stream = this.client.messages.stream(params);

            for await (var event of stream) {
                if (event.type === 'message_start' && event.message && event.message.usage) {
                    inputTokens = event.message.usage.input_tokens || 0;
                } else if (event.type === 'content_block_delta' && event.delta && event.delta.type === 'text_delta') {
                    var delta = event.delta.text || '';
                    fullContent += delta;
                    callbacks.onChunk({
                        index: chunkIndex++,
                        delta: delta,
                    });
                } else if (event.type === 'message_delta') {
                    if (event.usage) outputTokens = event.usage.output_tokens || 0;
                    if (event.delta && event.delta.stop_reason) finishReason = event.delta.stop_reason;
                }
            }
        } catch (streamErr) {
            callbacks.onError(streamErr);
            throw streamErr;
        }

        var response = {
            content: fullContent,
            model: model,
            provider: 'anthropic',
            usage: {
                inputTokens: inputTokens,
                outputTokens: outputTokens,
                totalTokens: inputTokens + outputTokens,
            },
            finishReason: finishReason,
        };

        callbacks.onChunk({ index: chunkIndex, delta: '', finishReason: finishReason });
        callbacks.onComplete(response);
        return response;
    }
}

module.exports = { AnthropicProvider: AnthropicProvider };
