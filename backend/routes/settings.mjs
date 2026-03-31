import { Router } from 'express';
import { getSafeSettings, updateSettings, getSettings, getEnabledModels } from '../../src/settings.mjs';
import Settings from '../../src/models/Settings.mjs';

const router = Router();

// GET /api/settings — returns settings with masked API keys
router.get('/', async (req, res) => {
  try {
    const settings = await getSafeSettings();
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/settings — update settings (legacy + models)
router.patch('/', async (req, res) => {
  try {
    const { llmBaseUrl, llmApiKey, llmModel, compareModels } = req.body;
    const updates = {};

    if (llmBaseUrl !== undefined) updates.llmBaseUrl = String(llmBaseUrl).trim();
    if (llmModel !== undefined) updates.llmModel = String(llmModel).trim();
    if (llmApiKey !== undefined && !llmApiKey.includes('••••')) updates.llmApiKey = String(llmApiKey).trim();
    if (compareModels !== undefined) {
      if (!Array.isArray(compareModels)) return res.status(400).json({ error: 'compareModels must be an array' });
      updates.compareModels = compareModels.map((m) => String(m).trim()).filter(Boolean);
    }

    const settings = await updateSettings(updates);
    const safe = await getSafeSettings();
    res.json(safe);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/settings/models — list models for evaluation (returns modelId strings for backward compat)
router.get('/models', async (req, res) => {
  try {
    const { format } = req.query;
    if (format === 'full') {
      // New format: return full model objects (masked keys)
      const settings = await getSafeSettings();
      res.json(settings.models || []);
    } else {
      // Legacy format: return array of enabled modelId strings
      const enabled = await getEnabledModels();
      res.json(enabled.map((m) => m.modelId));
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/settings/models — add a new model
router.post('/models', async (req, res) => {
  try {
    const { name, provider, baseUrl, apiKey, modelId, enabled } = req.body;
    if (!modelId || !baseUrl || !provider) {
      return res.status(400).json({ error: 'modelId, baseUrl, and provider are required' });
    }

    // If no API key provided (or masked), inherit from an existing model with same provider
    let resolvedApiKey = apiKey?.trim();
    if (!resolvedApiKey || resolvedApiKey === 'unused' && provider !== 'ollama' || resolvedApiKey.includes('••••')) {
      const settings = await getSettings();
      const sameProvider = settings.models?.find((m) => m.provider === provider && m.apiKey && m.apiKey !== 'unused');
      if (sameProvider) {
        resolvedApiKey = sameProvider.apiKey;
      }
    }

    const entry = {
      name: name || modelId.split('/').pop(),
      provider,
      baseUrl: baseUrl.trim(),
      apiKey: resolvedApiKey || 'unused',
      modelId: modelId.trim(),
      enabled: enabled !== false,
    };

    const settings = await Settings.findOneAndUpdate(
      { key: 'global' },
      { $push: { models: entry } },
      { upsert: true, new: true }
    );

    const added = settings.models[settings.models.length - 1];
    res.json({
      ...added.toObject(),
      apiKey: added.apiKey === 'unused' ? 'unused' : '••••',
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PATCH /api/settings/models/:id — update a model entry
router.patch('/models/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, provider, baseUrl, apiKey, modelId, enabled } = req.body;

    const setFields = {};
    if (name !== undefined) setFields['models.$.name'] = name;
    if (provider !== undefined) setFields['models.$.provider'] = provider;
    if (baseUrl !== undefined) setFields['models.$.baseUrl'] = baseUrl.trim();
    if (apiKey !== undefined && !apiKey.includes('••••')) setFields['models.$.apiKey'] = apiKey.trim();
    if (modelId !== undefined) setFields['models.$.modelId'] = modelId.trim();
    if (enabled !== undefined) setFields['models.$.enabled'] = enabled;

    await Settings.findOneAndUpdate(
      { key: 'global', 'models._id': id },
      { $set: setFields }
    );

    const safe = await getSafeSettings();
    const model = safe.models.find((m) => m._id.toString() === id);
    res.json(model || { error: 'Model not found' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE /api/settings/models/:id — remove a model entry
router.delete('/models/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await Settings.findOneAndUpdate(
      { key: 'global' },
      { $pull: { models: { _id: id } } }
    );
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/settings/models/:id/test — test a specific model's connection
router.post('/models/:id/test', async (req, res) => {
  try {
    const { id } = req.params;
    const settings = await getSettings();
    const model = settings.models.find((m) => m._id.toString() === id);
    if (!model) {
      return res.status(404).json({ error: 'Model not found' });
    }

    const headers = { 'Content-Type': 'application/json' };
    if (model.apiKey && model.apiKey !== 'unused') {
      headers['Authorization'] = `Bearer ${model.apiKey}`;
    }
    if (model.baseUrl.includes('openrouter.ai')) {
      headers['HTTP-Referer'] = 'https://github.com/auction-monitor';
      headers['X-Title'] = 'Auction Monitor';
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);

    const response = await fetch(`${model.baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: model.modelId,
        messages: [
          { role: 'system', content: 'You are a helpful assistant. Be very brief.' },
          { role: 'user', content: 'Say "Connection successful" and nothing else.' },
        ],
        temperature: 0,
        max_tokens: 20,
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);

    let testResult;
    if (!response.ok) {
      const errorBody = await response.text();
      testResult = { success: false, error: `API error ${response.status}: ${errorBody.substring(0, 200)}` };
    } else {
      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || '';
      testResult = {
        success: true,
        response: content,
        model: data.model || model.modelId,
        usage: data.usage || null,
      };
    }

    // Persist test result
    await Settings.findOneAndUpdate(
      { key: 'global', 'models._id': id },
      { $set: {
        'models.$.lastTest': {
          success: testResult.success,
          testedAt: new Date(),
          error: testResult.error || null,
        },
      }}
    );

    res.json(testResult);
  } catch (err) {
    if (err.name === 'AbortError') {
      return res.status(400).json({ error: 'Connection timed out after 30 seconds' });
    }
    res.status(400).json({ error: err.message });
  }
});

// POST /api/settings/test-llm — legacy test endpoint (tests primary model)
router.post('/test-llm', async (req, res) => {
  try {
    const settings = await getSettings();
    if (!settings.llmBaseUrl || !settings.llmModel) {
      return res.status(400).json({ error: 'LLM not configured. Set Base URL and Model first.' });
    }

    const headers = { 'Content-Type': 'application/json' };
    if (settings.llmApiKey && settings.llmApiKey !== 'unused') {
      headers['Authorization'] = `Bearer ${settings.llmApiKey}`;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);

    const response = await fetch(`${settings.llmBaseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: settings.llmModel,
        messages: [
          { role: 'system', content: 'You are a helpful assistant. Be very brief.' },
          { role: 'user', content: 'Say "Connection successful" and nothing else.' },
        ],
        temperature: 0,
        max_tokens: 20,
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!response.ok) {
      const errorBody = await response.text();
      return res.status(400).json({ error: `LLM API error ${response.status}: ${errorBody.substring(0, 200)}` });
    }

    const data = await response.json();
    res.json({
      success: true,
      response: data.choices?.[0]?.message?.content || '',
      model: data.model || settings.llmModel,
      usage: data.usage || null,
    });
  } catch (err) {
    if (err.name === 'AbortError') {
      return res.status(400).json({ error: 'Connection timed out after 30 seconds' });
    }
    res.status(400).json({ error: err.message });
  }
});

export default router;
