/**
 * OpenAI-Compatible Provider — works with OpenAI, xAI, Azure, Ollama, any
 * endpoint that supports the /v1/chat/completions streaming API.
 *
 * Adapted from cwm-architect's openai.ts provider.
 */

var BaseLlmProvider = require('./base-provider.js').BaseLlmProvider;

var DEFAULT_URLS = {
    openai:  'https://api.openai.com/v1',
    xai:     'https://api.x.ai/v1',
    azure:   '', // requires baseUrl in config
    custom:  'http://localhost:11434/v1',
};

class OpenAICompatibleProvider extends BaseLlmProvider {
    constructor(config) {
        super(config);
        this._name = config.provider || 'openai';
        this.baseUrl = config.baseUrl || DEFAULT_URLS[this._name] || DEFAULT_URLS.openai;
    }

    get name() { return this._name; }

    async chat(messages, options) {
        var model = (options && options.model) || this.config.model || 'gpt-4o-mini';
        var maxTokens = (options && options.maxTokens) || 4096;
        var temperature = (options && options.temperature) || 0.7;

        var body = {
            model: model,
            messages: this._buildMessages(messages, options),
            max_tokens: maxTokens,
            temperature: temperature,
        };

        var res = await fetch(this.baseUrl + '/chat/completions', {
            method: 'POST',
            headers: this._headers(),
            body: JSON.stringify(body),
        });

        if (!res.ok) {
            var text = await res.text();
            throw new Error('[' + this.name + '] API error: ' + res.status + ' — ' + text);
        }

        var data = await res.json();
        var choice = data.choices && data.choices[0];

        return {
            content: choice ? choice.message.content : '',
            model: data.model || model,
            provider: this.name,
            usage: {
                inputTokens: data.usage ? data.usage.prompt_tokens : 0,
                outputTokens: data.usage ? data.usage.completion_tokens : 0,
                totalTokens: data.usage ? data.usage.total_tokens : 0,
            },
            finishReason: choice ? choice.finish_reason : 'stop',
        };
    }

    async chatStream(messages, options, callbacks) {
        var model = (options && options.model) || this.config.model || 'gpt-4o-mini';
        var maxTokens = (options && options.maxTokens) || 4096;
        var temperature = (options && options.temperature) || 0.7;

        var body = {
            model: model,
            messages: this._buildMessages(messages, options),
            max_tokens: maxTokens,
            temperature: temperature,
            stream: true,
        };

        var res = await fetch(this.baseUrl + '/chat/completions', {
            method: 'POST',
            headers: this._headers(),
            body: JSON.stringify(body),
        });

        if (!res.ok) {
            var errText = await res.text();
            var err = new Error('[' + this.name + '] Stream error: ' + res.status + ' — ' + errText);
            callbacks.onError(err);
            throw err;
        }

        var reader = res.body.getReader();
        var decoder = new TextDecoder();
        var buffer = '';
        var fullContent = '';
        var chunkIndex = 0;
        var finishReason = 'stop';

        try {
            while (true) {
                var result = await reader.read();
                if (result.done) break;

                buffer += decoder.decode(result.value, { stream: true });
                var lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (var i = 0; i < lines.length; i++) {
                    var line = lines[i].trim();
                    if (!line || !line.startsWith('data: ')) continue;
                    var jsonStr = line.slice(6);
                    if (jsonStr === '[DONE]') continue;

                    try {
                        var parsed = JSON.parse(jsonStr);
                        var delta = parsed.choices && parsed.choices[0] && parsed.choices[0].delta;
                        if (delta && delta.content) {
                            fullContent += delta.content;
                            callbacks.onChunk({
                                index: chunkIndex++,
                                delta: delta.content,
                            });
                        }
                        if (parsed.choices && parsed.choices[0] && parsed.choices[0].finish_reason) {
                            finishReason = parsed.choices[0].finish_reason;
                        }
                    } catch (_e) {
                        // skip unparseable chunks
                    }
                }
            }
        } catch (streamErr) {
            callbacks.onError(streamErr);
            throw streamErr;
        }

        var response = {
            content: fullContent,
            model: model,
            provider: this.name,
            usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
            finishReason: finishReason,
        };

        callbacks.onChunk({ index: chunkIndex, delta: '', finishReason: finishReason });
        callbacks.onComplete(response);
        return response;
    }

    _headers() {
        return {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + this.config.apiKey,
        };
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

module.exports = { OpenAICompatibleProvider: OpenAICompatibleProvider };
