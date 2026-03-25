/**
 * Conversation Handler — processes chat actions from WebSocket clients.
 * Resolves LLM provider from ai:llmConfig, streams response back to client.
 * Persists messages as ai:message in ElementStore.
 */

var llm = require('./index.js');
var configStore = require('./config-store.js');

var ES_API = process.env.ES_API_URL || 'http://agura_web_1/elementStore';

// Track active streams per connection (for abort)
var activeStreams = new Map(); // connId → AbortController

/**
 * Handle a chat action from a WebSocket client.
 *
 * Message format:
 * {
 *   action: 'chat',
 *   conversation_id: 'conv-123',   // optional — auto-creates if missing
 *   content: 'Hello',              // user message text
 *   messages: [...],               // optional — full message history (if frontend manages it)
 *   options: {
 *     config_id: 'llm-456',        // specific ai:llmConfig ID (optional)
 *     model: 'gpt-4o',             // model override (optional)
 *     temperature: 0.9,            // temperature override (optional)
 *     max_tokens: 2048,            // max tokens override (optional)
 *     system_prompt: '...',        // system prompt (optional)
 *     stream: true,                // enable streaming (default: true)
 *   }
 * }
 */
async function handleChat(ws, msg, wsSend) {
    var conversationId = msg.conversation_id || null;
    var content = msg.content || '';
    var options = msg.options || {};
    var messageHistory = msg.messages || [];

    if (!content && messageHistory.length === 0) {
        wsSend(ws, { type: 'error', error: 'No content or messages provided' });
        return;
    }

    // Resolve provider
    var provider;
    try {
        provider = await llm.getProvider(options.config_id || null);
    } catch (e) {
        wsSend(ws, { type: 'error', error: 'Failed to resolve LLM provider: ' + e.message });
        return;
    }

    if (!provider) {
        wsSend(ws, {
            type: 'error',
            error: 'No LLM provider configured. Create an ai:llmConfig object in ElementStore.',
        });
        return;
    }

    if (!provider.isAvailable()) {
        wsSend(ws, { type: 'error', error: 'LLM provider "' + provider.name + '" is not available (missing API key?)' });
        return;
    }

    // Build messages array
    var messages = [];
    if (messageHistory.length > 0) {
        // Frontend provided full history — use it directly
        messages = messageHistory;
    } else {
        // Single message — wrap as user message
        messages = [{ role: 'user', content: content }];
    }

    // Signal start
    wsSend(ws, {
        type: 'chat_start',
        conversation_id: conversationId,
        provider: provider.name,
        model: options.model || provider.getDefaultModel(),
    });

    var shouldStream = options.stream !== false; // default: true
    var connId = ws._connId || 'unknown';

    if (shouldStream) {
        // Set up abort controller
        var abortController = { aborted: false };
        activeStreams.set(connId, abortController);

        try {
            await provider.chatStream(messages, {
                model: options.model,
                maxTokens: options.max_tokens,
                temperature: options.temperature,
                systemPrompt: options.system_prompt,
            }, {
                onChunk: function (chunk) {
                    if (abortController.aborted) return;
                    wsSend(ws, {
                        type: 'chunk',
                        conversation_id: conversationId,
                        index: chunk.index,
                        delta: chunk.delta,
                        finish_reason: chunk.finishReason || null,
                    });
                },
                onComplete: function (response) {
                    if (abortController.aborted) return;
                    wsSend(ws, {
                        type: 'chat_complete',
                        conversation_id: conversationId,
                        content: response.content,
                        model: response.model,
                        provider: response.provider,
                        usage: response.usage,
                        finish_reason: response.finishReason,
                    });

                    // Persist messages to ES (fire-and-forget)
                    persistMessages(conversationId, content, response).catch(function (e) {
                        console.warn('[chat] Failed to persist messages:', e.message);
                    });
                },
                onError: function (error) {
                    wsSend(ws, {
                        type: 'error',
                        conversation_id: conversationId,
                        error: error.message || 'Streaming error',
                    });
                },
            });
        } catch (e) {
            if (!abortController.aborted) {
                wsSend(ws, {
                    type: 'error',
                    conversation_id: conversationId,
                    error: e.message || 'Chat failed',
                });
            }
        } finally {
            activeStreams.delete(connId);
        }
    } else {
        // Non-streaming
        try {
            var response = await provider.chat(messages, {
                model: options.model,
                maxTokens: options.max_tokens,
                temperature: options.temperature,
                systemPrompt: options.system_prompt,
            });

            wsSend(ws, {
                type: 'chat_complete',
                conversation_id: conversationId,
                content: response.content,
                model: response.model,
                provider: response.provider,
                usage: response.usage,
                finish_reason: response.finishReason,
            });

            persistMessages(conversationId, content, response).catch(function (e) {
                console.warn('[chat] Failed to persist messages:', e.message);
            });
        } catch (e) {
            wsSend(ws, {
                type: 'error',
                conversation_id: conversationId,
                error: e.message || 'Chat failed',
            });
        }
    }
}

/**
 * Handle chat_stop — abort active streaming
 */
function handleChatStop(ws) {
    var connId = ws._connId || 'unknown';
    var controller = activeStreams.get(connId);
    if (controller) {
        controller.aborted = true;
        activeStreams.delete(connId);
        console.log('[chat] Stream aborted for connection ' + connId);
    }
}

/**
 * Handle chat_providers — list available LLM configs
 */
async function handleChatProviders(ws, wsSend) {
    try {
        var providers = await llm.listProviders();
        wsSend(ws, { type: 'chat_providers', providers: providers });
    } catch (e) {
        wsSend(ws, { type: 'error', error: 'Failed to list providers: ' + e.message });
    }
}

/**
 * Persist user message and assistant response as ai:message in ElementStore
 */
async function persistMessages(conversationId, userContent, aiResponse) {
    if (!conversationId) return;

    // Persist user message
    try {
        await configStore.httpPost(ES_API + '/store/ai:message', {
            conversation_id: conversationId,
            role: 'user',
            content: userContent,
            created: new Date().toISOString(),
        });
    } catch (_e) { /* best-effort */ }

    // Persist assistant response
    try {
        await configStore.httpPost(ES_API + '/store/ai:message', {
            conversation_id: conversationId,
            role: 'assistant',
            content: aiResponse.content,
            metadata: {
                model: aiResponse.model,
                provider: aiResponse.provider,
                tokens_used: aiResponse.usage ? aiResponse.usage.totalTokens : 0,
            },
            created: new Date().toISOString(),
        });
    } catch (_e) { /* best-effort */ }
}

module.exports = {
    handleChat: handleChat,
    handleChatStop: handleChatStop,
    handleChatProviders: handleChatProviders,
};
