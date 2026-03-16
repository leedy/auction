// Provider-agnostic LLM client — works with OpenRouter, Ollama, or any OpenAI-compatible API
// Uses native fetch, no SDK dependency
import { loadEnv } from './env.mjs';

loadEnv();

const DEFAULT_TIMEOUT_MS = 120_000; // 2 min for cloud, increase for local models

function getConfig() {
  const baseUrl = process.env.LLM_BASE_URL;
  const apiKey = process.env.LLM_API_KEY;
  const model = process.env.LLM_MODEL;

  if (!baseUrl || !model) {
    throw new Error(
      'LLM not configured. Set LLM_BASE_URL and LLM_MODEL in .env\n' +
      'Examples:\n' +
      '  OpenRouter: LLM_BASE_URL=https://openrouter.ai/api/v1  LLM_MODEL=openai/gpt-4o-mini\n' +
      '  Ollama:     LLM_BASE_URL=http://localhost:11434/v1      LLM_MODEL=qwen2.5:32b'
    );
  }

  return { baseUrl, apiKey, model };
}

function isOpenRouter(baseUrl) {
  return baseUrl.includes('openrouter.ai');
}

/**
 * Send a chat completion request. Returns the full response object.
 *
 * @param {Array<{role: string, content: string}>} messages
 * @param {object} [options]
 * @param {string} [options.model] — override the default model
 * @param {number} [options.temperature] — defaults to 0.3
 * @param {number} [options.maxTokens] — defaults to 4096
 * @param {number} [options.timeout] — request timeout in ms
 * @param {boolean} [options.json] — request JSON response format
 * @returns {Promise<{content: string, model: string, usage: object}>}
 */
export async function chatCompletion(messages, options = {}) {
  const config = getConfig();
  const model = options.model || config.model;
  const temperature = options.temperature ?? 0.3;
  const maxTokens = options.maxTokens ?? 4096;
  const timeout = options.timeout ?? DEFAULT_TIMEOUT_MS;

  const headers = {
    'Content-Type': 'application/json',
  };

  if (config.apiKey && config.apiKey !== 'unused') {
    headers['Authorization'] = `Bearer ${config.apiKey}`;
  }

  // OpenRouter-specific headers for ranking/analytics
  if (isOpenRouter(config.baseUrl)) {
    headers['HTTP-Referer'] = 'https://github.com/auction-monitor';
    headers['X-Title'] = 'Auction Monitor';
  }

  const body = {
    model,
    messages,
    temperature,
    max_tokens: maxTokens,
  };

  if (options.json) {
    body.response_format = { type: 'json_object' };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`LLM API error ${response.status}: ${errorBody}`);
    }

    const data = await response.json();
    const choice = data.choices?.[0];

    if (!choice) {
      throw new Error('LLM returned no choices');
    }

    return {
      content: choice.message?.content || '',
      model: data.model || model,
      usage: data.usage || null,
    };
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error(`LLM request timed out after ${timeout}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Chat completion that parses the response as JSON.
 * Requests JSON mode from the API and parses the result.
 *
 * @param {Array<{role: string, content: string}>} messages
 * @param {object} [options] — same as chatCompletion
 * @returns {Promise<{data: object, model: string, usage: object}>}
 */
export async function jsonCompletion(messages, options = {}) {
  const result = await chatCompletion(messages, { ...options, json: true });

  try {
    const data = JSON.parse(result.content);
    return { data, model: result.model, usage: result.usage };
  } catch (err) {
    // Some models don't respect json mode — try to extract JSON from the response
    const jsonMatch = result.content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const data = JSON.parse(jsonMatch[0]);
        return { data, model: result.model, usage: result.usage };
      } catch {
        // fall through to error
      }
    }
    throw new Error(`Failed to parse LLM response as JSON: ${result.content.substring(0, 200)}`);
  }
}

/**
 * Get the current LLM configuration (for display/logging, not secrets).
 */
export function getLLMConfig() {
  try {
    const config = getConfig();
    return {
      baseUrl: config.baseUrl,
      model: config.model,
      provider: isOpenRouter(config.baseUrl) ? 'OpenRouter' :
                config.baseUrl.includes('localhost') ? 'Local (Ollama)' : 'Custom',
      hasApiKey: !!(config.apiKey && config.apiKey !== 'unused'),
    };
  } catch {
    return null;
  }
}
