// Settings management — singleton config stored in MongoDB
import Settings from './models/Settings.mjs';

/**
 * Get the global settings. Creates defaults if none exist.
 * Auto-migrates legacy flat LLM config into the models array.
 */
export async function getSettings() {
  let settings = await Settings.findOne({ key: 'global' }).lean();
  if (!settings) {
    settings = await Settings.create({ key: 'global' });
    settings = settings.toObject();
  }

  // One-time migration: legacy flat fields → models array
  if ((!settings.models || settings.models.length === 0) && settings.llmModel) {
    const models = [];
    const provider = settings.llmBaseUrl?.includes('openrouter.ai') ? 'openrouter'
      : settings.llmBaseUrl?.includes('localhost') || settings.llmBaseUrl?.includes('11434') ? 'ollama'
      : 'custom';

    models.push({
      name: settings.llmModel.split('/').pop(),
      provider,
      baseUrl: settings.llmBaseUrl,
      apiKey: settings.llmApiKey || 'unused',
      modelId: settings.llmModel,
      enabled: true,
    });

    if (settings.compareModels?.length) {
      for (const m of settings.compareModels) {
        if (m && m !== settings.llmModel) {
          models.push({
            name: m.split('/').pop(),
            provider,
            baseUrl: settings.llmBaseUrl,
            apiKey: settings.llmApiKey || 'unused',
            modelId: m,
            enabled: true,
          });
        }
      }
    }

    const updated = await Settings.findOneAndUpdate(
      { key: 'global' },
      { $set: { models } },
      { new: true }
    );
    settings = updated.toObject();
  }

  return settings;
}

/**
 * Update settings. Pass only the fields to change.
 */
export async function updateSettings(updates) {
  const allowed = ['llmBaseUrl', 'llmApiKey', 'llmModel', 'compareModels', 'models'];
  const filtered = {};
  for (const key of allowed) {
    if (updates[key] !== undefined) {
      filtered[key] = updates[key];
    }
  }

  const settings = await Settings.findOneAndUpdate(
    { key: 'global' },
    { $set: filtered },
    { upsert: true, new: true }
  );

  return settings.toObject();
}

/**
 * Get settings with API keys masked for frontend display.
 */
export async function getSafeSettings() {
  const settings = await getSettings();
  return {
    ...settings,
    llmApiKey: settings.llmApiKey ? maskKey(settings.llmApiKey) : '',
    models: (settings.models || []).map((m) => ({
      ...m,
      apiKey: m.apiKey ? maskKey(m.apiKey) : '',
    })),
  };
}

/**
 * Get all enabled models with their full config (including real API keys).
 */
export async function getEnabledModels() {
  const settings = await getSettings();
  return (settings.models || []).filter((m) => m.enabled);
}

function maskKey(key) {
  if (!key || key === 'unused') return key;
  if (key.length <= 8) return '••••••••';
  return key.slice(0, 4) + '••••' + key.slice(-4);
}
