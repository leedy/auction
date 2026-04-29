// Provider-agnostic LLM client — works with OpenRouter, Ollama, or any OpenAI-compatible API
// Uses native fetch, no SDK dependency
// Config priority: env vars > database settings
import { loadEnv } from './env.mjs';

loadEnv();

const DEFAULT_TIMEOUT_MS = 120_000; // 2 min for cloud, increase for local models

// Cached DB settings to avoid hitting MongoDB on every LLM call
let _dbSettingsCache = null;
let _dbSettingsCacheTime = 0;
const DB_CACHE_TTL = 60_000; // refresh from DB every 60s

async function getDbSettings() {
  const now = Date.now();
  if (_dbSettingsCache && (now - _dbSettingsCacheTime) < DB_CACHE_TTL) {
    return _dbSettingsCache;
  }

  try {
    // Dynamic import to avoid circular deps and allow standalone use (test scripts)
    const { getSettings } = await import('./settings.mjs');
    _dbSettingsCache = await getSettings();
    _dbSettingsCacheTime = now;
    return _dbSettingsCache;
  } catch {
    // DB not connected — that's fine for standalone test scripts
    return null;
  }
}

/**
 * Get LLM config. Priority: env vars > database settings.
 * Async because it may need to read from DB.
 */
async function getConfig() {
  // Check env vars first
  let baseUrl = process.env.LLM_BASE_URL;
  let apiKey = process.env.LLM_API_KEY;
  let model = process.env.LLM_MODEL;

  // Fall back to database settings
  if (!baseUrl || !model) {
    const dbSettings = await getDbSettings();
    if (dbSettings) {
      // Try new models array first, then legacy fields
      const enabledModels = (dbSettings.models || []).filter((m) => m.enabled);
      if (enabledModels.length > 0) {
        const first = enabledModels[0];
        baseUrl = baseUrl || first.baseUrl;
        apiKey = apiKey || first.apiKey;
        model = model || first.modelId;
      } else {
        baseUrl = baseUrl || dbSettings.llmBaseUrl;
        apiKey = apiKey || dbSettings.llmApiKey;
        model = model || dbSettings.llmModel;
      }
    }
  }

  if (!baseUrl || !model) {
    throw new Error(
      'LLM not configured. Set up via Admin page or add LLM_BASE_URL and LLM_MODEL to .env\n' +
      'Examples:\n' +
      '  OpenRouter: LLM_BASE_URL=https://openrouter.ai/api/v1  LLM_MODEL=openai/gpt-4o-mini\n' +
      '  Ollama:     LLM_BASE_URL=http://localhost:11434/v1      LLM_MODEL=qwen2.5:32b'
    );
  }

  return { baseUrl, apiKey, model };
}

/**
 * Build config from a model entry (from the models array in settings).
 */
export function getConfigForModel(modelEntry) {
  return {
    baseUrl: modelEntry.baseUrl,
    apiKey: modelEntry.apiKey || 'unused',
    model: modelEntry.modelId,
  };
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
 * @param {object} [options.config] — per-model config { baseUrl, apiKey, model }
 * @returns {Promise<{content: string, model: string, usage: object}>}
 */
export async function chatCompletion(messages, options = {}) {
  const config = options.config || await getConfig();
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

  // Anthropic models don't support response_format — they follow JSON
  // instructions from the system prompt reliably without it
  const isAnthropic = model.startsWith('anthropic/') || model.startsWith('claude-');
  if (options.json && !isAnthropic) {
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
      redirect: 'error',
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
export async function getLLMConfig() {
  try {
    const config = await getConfig();
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
