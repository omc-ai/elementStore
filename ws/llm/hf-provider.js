/**
 * HuggingFace Inference Provider — streaming chat via HuggingFace's InferenceClient.
 */

var BaseLlmProvider = require('./base-provider.js').BaseLlmProvider;

class HuggingFaceProvider extends BaseLlmProvider {
    constructor(config) {
        super(config);
        try {
            var hf = require('@huggingface/inference');
            this.client = new hf.InferenceClient(config.apiKey);
        } catch (e) {
            console.warn('[huggingface] SDK not installed, provider unavailable');
            this.client = null;
        }
    }

    get name() { return 'huggingface'; }

    isAvailable() {
        return !!this.client && !!this.config.apiKey;
    }

    async chat(messages, options) {
        if (!this.client) throw new Error('HuggingFace SDK not available');

        var model = (options && options.model) || this.config.model || 'meta-llama/Llama-3.1-8B-Instruct';
        var maxTokens = (options && options.maxTokens) || 2048;
        var temperature = (options && options.temperature) || 0.9;

        var hfMessages = this._buildMessages(messages, options);

        var response = await this.client.chatCompletion({
            model: model,
            messages: hfMessages,
            max_tokens: maxTokens,
            temperature: temperature,
        });

        var choice = response.choices && response.choices[0];

        return {
            content: choice ? choice.message.content : '',
            model: model,
            provider: 'huggingface',
            usage: {
                inputTokens: response.usage ? response.usage.prompt_tokens : 0,
                outputTokens: response.usage ? response.usage.completion_tokens : 0,
                totalTokens: response.usage ? response.usage.total_tokens : 0,
            },
            finishReason: choice ? choice.finish_reason : 'stop',
        };
    }

    async chatStream(messages, options, callbacks) {
        if (!this.client) throw new Error('HuggingFace SDK not available');

        var model = (options && options.model) || this.config.model || 'meta-llama/Llama-3.1-8B-Instruct';
        var maxTokens = (options && options.maxTokens) || 2048;
        var temperature = (options && options.temperature) || 0.9;

        var hfMessages = this._buildMessages(messages, options);
        var fullContent = '';
        var chunkIndex = 0;
        var finishReason = 'stop';

        try {
            var stream = this.client.chatCompletionStream({
                model: model,
                messages: hfMessages,
                max_tokens: maxTokens,
                temperature: temperature,
            });

            for await (var chunk of stream) {
                var delta = chunk.choices && chunk.choices[0] && chunk.choices[0].delta && chunk.choices[0].delta.content;
                if (delta) {
                    fullContent += delta;
                    callbacks.onChunk({
                        index: chunkIndex++,
                        delta: delta,
                    });
                }
                if (chunk.choices && chunk.choices[0] && chunk.choices[0].finish_reason) {
                    finishReason = chunk.choices[0].finish_reason;
                }
            }
        } catch (streamErr) {
            callbacks.onError(streamErr);
            throw streamErr;
        }

        var response = {
            content: fullContent,
            model: model,
            provider: 'huggingface',
            usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
            finishReason: finishReason,
        };

        callbacks.onChunk({ index: chunkIndex, delta: '', finishReason: finishReason });
        callbacks.onComplete(response);
        return response;
    }

    _buildMessages(messages, options) {
        var result = [];
        if (options && options.systemPrompt) {
            result.push({ role: 'system', content: options.systemPrompt });
        }
        for (var i = 0; i < messages.length; i++) {
            result.push({ role: messages[i].role, content: messages[i].content });
        }
        return result;
    }
}

module.exports = { HuggingFaceProvider: HuggingFaceProvider };
