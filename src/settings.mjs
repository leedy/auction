// Settings management — singleton config stored in MongoDB
import Settings from './models/Settings.mjs';

/**
 * Get the global settings. Creates defaults if none exist.
 */
export async function getSettings() {
  let settings = await Settings.findOne({ key: 'global' }).lean();
  if (!settings) {
    settings = await Settings.create({ key: 'global' });
    settings = settings.toObject();
  }
  return settings;
}

/**
 * Update settings. Pass only the fields to change.
 */
export async function updateSettings(updates) {
  const allowed = ['llmBaseUrl', 'llmApiKey', 'llmModel', 'compareModels'];
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
 * Get settings with API key masked for frontend display.
 */
export async function getSafeSettings() {
  const settings = await getSettings();
  return {
    ...settings,
    llmApiKey: settings.llmApiKey ? maskKey(settings.llmApiKey) : '',
  };
}

function maskKey(key) {
  if (key.length <= 8) return '••••••••';
  return key.slice(0, 4) + '••••' + key.slice(-4);
}
