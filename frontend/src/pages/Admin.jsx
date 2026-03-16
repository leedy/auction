import { useState, useEffect } from 'react';
import { getSettings, updateSettings, testLLMConnection } from '../services/api';

const PROVIDER_PRESETS = [
  {
    name: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    models: ['openai/gpt-4o-mini', 'anthropic/claude-haiku-4-5-20251001', 'anthropic/claude-sonnet-4-20250514', 'google/gemini-2.0-flash-001'],
  },
  {
    name: 'Ollama (Local)',
    baseUrl: 'http://localhost:11434/v1',
    models: ['qwen2.5:32b', 'qwen2.5:7b', 'llama3.1:8b', 'llama3.1:70b'],
  },
];

function Admin() {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [testResult, setTestResult] = useState(null);

  // Form state
  const [llmBaseUrl, setLlmBaseUrl] = useState('');
  const [llmApiKey, setLlmApiKey] = useState('');
  const [llmModel, setLlmModel] = useState('');
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getSettings();
      setSettings(data);
      setLlmBaseUrl(data.llmBaseUrl || '');
      setLlmApiKey(data.llmApiKey || '');
      setLlmModel(data.llmModel || '');
    } catch (err) {
      setError('Failed to load settings.');
    } finally {
      setLoading(false);
    }
  };

  const handleFieldChange = (setter) => (e) => {
    setter(e.target.value);
    setDirty(true);
    setSuccess(null);
  };

  const handlePreset = (preset) => {
    setLlmBaseUrl(preset.baseUrl);
    if (preset.name === 'Ollama (Local)') {
      setLlmApiKey('unused');
    }
    setDirty(true);
    setSuccess(null);
  };

  const handleModelSelect = (model) => {
    setLlmModel(model);
    setDirty(true);
    setSuccess(null);
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const updates = {
        llmBaseUrl,
        llmModel,
      };
      // Only send API key if it was changed (not the masked version)
      if (!llmApiKey.includes('••••')) {
        updates.llmApiKey = llmApiKey;
      }
      const data = await updateSettings(updates);
      setSettings(data);
      setLlmApiKey(data.llmApiKey || '');
      setDirty(false);
      setSuccess('Settings saved.');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save settings.');
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    setError(null);
    try {
      // Save first if dirty
      if (dirty) {
        await handleSave();
      }
      const result = await testLLMConnection();
      setTestResult(result);
    } catch (err) {
      setTestResult({ success: false, error: err.response?.data?.error || 'Connection test failed.' });
    } finally {
      setTesting(false);
    }
  };

  const activePreset = PROVIDER_PRESETS.find((p) => llmBaseUrl === p.baseUrl);

  if (loading) {
    return <div className="page"><div className="loading">Loading...</div></div>;
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1>Admin</h1>
      </div>

      {error && <div className="error-banner">{error}</div>}
      {success && <div className="success-banner">{success}</div>}

      <div className="admin-section">
        <h2>LLM Configuration</h2>
        <p className="admin-section-desc">
          Configure the AI model used for interest expansion and lot evaluation.
          Supports OpenRouter (cloud) or Ollama (local).
        </p>

        {/* Provider presets */}
        <div className="admin-field">
          <label>Provider</label>
          <div className="preset-buttons">
            {PROVIDER_PRESETS.map((preset) => (
              <button
                key={preset.name}
                className={`btn ${activePreset?.name === preset.name ? 'btn-preset-active' : 'btn-preset'}`}
                onClick={() => handlePreset(preset)}
              >
                {preset.name}
              </button>
            ))}
          </div>
        </div>

        {/* Base URL */}
        <div className="admin-field">
          <label htmlFor="llmBaseUrl">Base URL</label>
          <input
            id="llmBaseUrl"
            type="text"
            value={llmBaseUrl}
            onChange={handleFieldChange(setLlmBaseUrl)}
            placeholder="https://openrouter.ai/api/v1"
          />
        </div>

        {/* API Key */}
        <div className="admin-field">
          <label htmlFor="llmApiKey">API Key</label>
          <input
            id="llmApiKey"
            type="password"
            value={llmApiKey}
            onChange={handleFieldChange(setLlmApiKey)}
            placeholder="Enter API key (use 'unused' for Ollama)"
            onFocus={(e) => {
              if (e.target.value.includes('••••')) {
                setLlmApiKey('');
                setDirty(true);
              }
            }}
          />
          <span className="field-hint">Stored securely in database. Masked after save.</span>
        </div>

        {/* Model */}
        <div className="admin-field">
          <label htmlFor="llmModel">Model</label>
          <input
            id="llmModel"
            type="text"
            value={llmModel}
            onChange={handleFieldChange(setLlmModel)}
            placeholder="openai/gpt-4o-mini"
          />
          {activePreset && (
            <div className="model-suggestions">
              {activePreset.models.map((m) => (
                <button
                  key={m}
                  className={`btn btn-model-tag ${llmModel === m ? 'btn-model-tag-active' : ''}`}
                  onClick={() => handleModelSelect(m)}
                >
                  {m}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="admin-actions">
          <button
            className="btn btn-save"
            onClick={handleSave}
            disabled={saving || !dirty}
          >
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
          <button
            className="btn btn-test"
            onClick={handleTest}
            disabled={testing || !llmBaseUrl || !llmModel}
          >
            {testing ? 'Testing...' : 'Test Connection'}
          </button>
        </div>

        {/* Test Result */}
        {testResult && (
          <div className={`test-result ${testResult.success ? 'test-success' : 'test-failure'}`}>
            {testResult.success ? (
              <>
                <div className="test-result-header">Connection Successful</div>
                <div className="test-result-detail">Model: {testResult.model}</div>
                <div className="test-result-detail">Response: {testResult.response}</div>
                {testResult.usage && (
                  <div className="test-result-detail">
                    Tokens: {testResult.usage.prompt_tokens} in / {testResult.usage.completion_tokens} out
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="test-result-header">Connection Failed</div>
                <div className="test-result-detail">{testResult.error}</div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default Admin;
