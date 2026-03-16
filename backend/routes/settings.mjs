import { Router } from 'express';
import { getSafeSettings, updateSettings, getSettings } from '../../src/settings.mjs';

const router = Router();

// GET /api/settings — returns settings with masked API key
router.get('/', async (req, res) => {
  try {
    const settings = await getSafeSettings();
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/settings — update settings
router.patch('/', async (req, res) => {
  try {
    const { llmBaseUrl, llmApiKey, llmModel, compareModels } = req.body;
    const updates = {};

    if (llmBaseUrl !== undefined) {
      if (typeof llmBaseUrl !== 'string') {
        return res.status(400).json({ error: 'llmBaseUrl must be a string' });
      }
      updates.llmBaseUrl = llmBaseUrl.trim();
    }

    if (llmApiKey !== undefined) {
      if (typeof llmApiKey !== 'string') {
        return res.status(400).json({ error: 'llmApiKey must be a string' });
      }
      // Don't update if it's the masked version
      if (!llmApiKey.includes('••••')) {
        updates.llmApiKey = llmApiKey.trim();
      }
    }

    if (llmModel !== undefined) {
      if (typeof llmModel !== 'string') {
        return res.status(400).json({ error: 'llmModel must be a string' });
      }
      updates.llmModel = llmModel.trim();
    }

    if (compareModels !== undefined) {
      if (!Array.isArray(compareModels) || !compareModels.every((m) => typeof m === 'string')) {
        return res.status(400).json({ error: 'compareModels must be an array of strings' });
      }
      updates.compareModels = compareModels.map((m) => m.trim()).filter(Boolean);
    }

    const settings = await updateSettings(updates);
    // Return safe version (masked key)
    const safe = { ...settings };
    if (safe.llmApiKey) {
      safe.llmApiKey = safe.llmApiKey.length <= 8 ? '••••••••' :
        safe.llmApiKey.slice(0, 4) + '••••' + safe.llmApiKey.slice(-4);
    }
    res.json(safe);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/settings/test-llm — test the LLM connection
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
    if (settings.llmBaseUrl.includes('openrouter.ai')) {
      headers['HTTP-Referer'] = 'https://github.com/auction-monitor';
      headers['X-Title'] = 'Auction Monitor';
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
    const content = data.choices?.[0]?.message?.content || '';
    const model = data.model || settings.llmModel;

    res.json({
      success: true,
      response: content,
      model,
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
