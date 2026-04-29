import { Router } from 'express';
import { getSafeSettings, updateSettings, getSettings, getEnabledModels } from '../../src/settings.mjs';
import Settings from '../../src/models/Settings.mjs';
import { assertSafeBaseUrl } from '../middleware/validateLlmBaseUrl.mjs';
import { asyncHandler } from '../utils/asyncHandler.mjs';
import { HttpError } from '../utils/HttpError.mjs';
import { llmSpendLimiter } from '../middleware/rateLimits.mjs';

const router = Router();

router.get('/', asyncHandler(async (req, res) => {
  const settings = await getSafeSettings();
  res.json(settings);
}));

router.patch('/', asyncHandler(async (req, res) => {
  const { llmBaseUrl, llmApiKey, llmModel, compareModels } = req.body;
  const updates = {};

  if (llmBaseUrl !== undefined) {
    await assertSafeBaseUrl(llmBaseUrl);
    updates.llmBaseUrl = String(llmBaseUrl).trim();
  }
  if (llmModel !== undefined) updates.llmModel = String(llmModel).trim();
  if (llmApiKey !== undefined && !llmApiKey.includes('••••')) updates.llmApiKey = String(llmApiKey).trim();
  if (compareModels !== undefined) {
    if (!Array.isArray(compareModels)) throw new HttpError(400, 'compareModels must be an array');
    updates.compareModels = compareModels.map((m) => String(m).trim()).filter(Boolean);
  }

  await updateSettings(updates);
  const safe = await getSafeSettings();
  res.json(safe);
}));

router.get('/models', asyncHandler(async (req, res) => {
  const { format } = req.query;
  if (format === 'full') {
    const settings = await getSafeSettings();
    res.json(settings.models || []);
  } else {
    const enabled = await getEnabledModels();
    res.json(enabled.map((m) => m.modelId));
  }
}));

router.post('/models', asyncHandler(async (req, res) => {
  const { name, provider, baseUrl, apiKey, modelId, enabled } = req.body;
  if (!modelId || !baseUrl || !provider) {
    throw new HttpError(400, 'modelId, baseUrl, and provider are required');
  }

  await assertSafeBaseUrl(baseUrl);

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
}));

router.patch('/models/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { name, provider, baseUrl, apiKey, modelId, enabled } = req.body;

  const setFields = {};
  if (name !== undefined) setFields['models.$.name'] = name;
  if (provider !== undefined) setFields['models.$.provider'] = provider;
  if (baseUrl !== undefined) {
    await assertSafeBaseUrl(baseUrl);
    setFields['models.$.baseUrl'] = baseUrl.trim();
  }
  if (apiKey !== undefined && !apiKey.includes('••••')) setFields['models.$.apiKey'] = apiKey.trim();
  if (modelId !== undefined) setFields['models.$.modelId'] = modelId.trim();
  if (enabled !== undefined) setFields['models.$.enabled'] = enabled;

  await Settings.findOneAndUpdate(
    { key: 'global', 'models._id': id },
    { $set: setFields }
  );

  const safe = await getSafeSettings();
  const model = safe.models.find((m) => m._id.toString() === id);
  if (!model) throw new HttpError(404, 'Model not found');
  res.json(model);
}));

router.delete('/models/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  await Settings.findOneAndUpdate(
    { key: 'global' },
    { $pull: { models: { _id: id } } }
  );
  res.json({ success: true });
}));

router.post('/models/:id/test', llmSpendLimiter, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const settings = await getSettings();
  const model = settings.models.find((m) => m._id.toString() === id);
  if (!model) throw new HttpError(404, 'Model not found');

  await assertSafeBaseUrl(model.baseUrl);

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

  let response;
  try {
    response = await fetch(`${model.baseUrl}/chat/completions`, {
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
      redirect: 'error',
    });
  } catch (err) {
    clearTimeout(timer);
    if (err.name === 'AbortError') throw new HttpError(400, 'Connection timed out after 30 seconds');
    throw new HttpError(400, `Connection failed: ${err.message}`);
  }
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
}));

router.post('/test-llm', llmSpendLimiter, asyncHandler(async (req, res) => {
  const settings = await getSettings();
  if (!settings.llmBaseUrl || !settings.llmModel) {
    throw new HttpError(400, 'LLM not configured. Set Base URL and Model first.');
  }

  await assertSafeBaseUrl(settings.llmBaseUrl);

  const headers = { 'Content-Type': 'application/json' };
  if (settings.llmApiKey && settings.llmApiKey !== 'unused') {
    headers['Authorization'] = `Bearer ${settings.llmApiKey}`;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);

  let response;
  try {
    response = await fetch(`${settings.llmBaseUrl}/chat/completions`, {
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
      redirect: 'error',
    });
  } catch (err) {
    clearTimeout(timer);
    if (err.name === 'AbortError') throw new HttpError(400, 'Connection timed out after 30 seconds');
    throw new HttpError(400, `Connection failed: ${err.message}`);
  }
  clearTimeout(timer);

  if (!response.ok) {
    const errorBody = await response.text();
    throw new HttpError(400, `LLM API error ${response.status}: ${errorBody.substring(0, 200)}`);
  }

  const data = await response.json();
  res.json({
    success: true,
    response: data.choices?.[0]?.message?.content || '',
    model: data.model || settings.llmModel,
    usage: data.usage || null,
  });
}));

export default router;
