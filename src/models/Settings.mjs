import mongoose from 'mongoose';

const modelEntrySchema = new mongoose.Schema({
  name: { type: String, required: true },       // Display name
  provider: { type: String, enum: ['openrouter', 'ollama', 'custom'], required: true },
  baseUrl: { type: String, required: true },
  apiKey: { type: String, default: 'unused' },
  modelId: { type: String, required: true },     // Model ID sent to API
  enabled: { type: Boolean, default: true },     // Include in evaluation runs
  lastTest: {
    success: { type: Boolean },
    testedAt: { type: Date },
    error: { type: String },
  },
}, { _id: true });

const settingsSchema = new mongoose.Schema({
  // Singleton — only one settings document exists
  key: { type: String, default: 'global', unique: true },

  // Per-model LLM configuration
  models: [modelEntrySchema],

  // Legacy fields (kept for backward compat / migration)
  llmBaseUrl: { type: String, default: '' },
  llmApiKey: { type: String, default: '' },
  llmModel: { type: String, default: '' },
  compareModels: [{ type: String }],
}, {
  timestamps: true,
});

const Settings = mongoose.model('Settings', settingsSchema);

export default Settings;
