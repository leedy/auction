import mongoose from 'mongoose';

const settingsSchema = new mongoose.Schema({
  // Singleton — only one settings document exists
  key: { type: String, default: 'global', unique: true },

  // LLM Configuration
  llmBaseUrl: { type: String, default: '' },
  llmApiKey: { type: String, default: '' },
  llmModel: { type: String, default: '' },

  // Optional: models to compare in test-llm-compare.mjs
  compareModels: [{ type: String }],
}, {
  timestamps: true,
});

const Settings = mongoose.model('Settings', settingsSchema);

export default Settings;
