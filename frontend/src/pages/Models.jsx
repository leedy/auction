import { useState, useEffect } from 'react';
import { getModels, addModel, updateModel, deleteModel, testModel } from '../services/api';

const PROVIDERS = [
  {
    id: 'openrouter',
    name: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    needsKey: true,
    suggestions: ['anthropic/claude-sonnet-4-20250514', 'google/gemini-2.0-flash-001', 'openai/gpt-4o-mini', 'deepseek/deepseek-chat-v3-0324'],
  },
  {
    id: 'ollama',
    name: 'Ollama',
    baseUrl: 'http://localhost:11434/v1',
    needsKey: false,
    suggestions: ['qwen2.5:32b', 'qwen3:32b', 'gemma3:27b', 'llama3.1:70b', 'llama3.1:8b'],
  },
];

function Models() {
  const [models, setModels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Add model form
  const [showAdd, setShowAdd] = useState(false);
  const [addProvider, setAddProvider] = useState('openrouter');
  const [addModelId, setAddModelId] = useState('');
  const [addBaseUrl, setAddBaseUrl] = useState('');
  const [addApiKey, setAddApiKey] = useState('');
  const [adding, setAdding] = useState(false);

  // Per-model test results and key editing (keyed by model _id)
  const [testResults, setTestResults] = useState({});
  const [testing, setTesting] = useState({});
  const [editingKey, setEditingKey] = useState(null);
  const [editKeyValue, setEditKeyValue] = useState('');

  const load = async () => {
    try {
      const data = await getModels();
      setModels(data);
    } catch (err) {
      setError('Failed to load models.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const selectedProvider = PROVIDERS.find((p) => p.id === addProvider);

  const handleProviderChange = (providerId) => {
    setAddProvider(providerId);
    const p = PROVIDERS.find((pr) => pr.id === providerId);
    // Reuse base URL and API key from an existing model with the same provider
    const existing = models.find((m) => m.provider === providerId);
    setAddBaseUrl(existing?.baseUrl || p.baseUrl);
    // For providers needing a key, leave blank — backend will inherit from existing models
    setAddApiKey(p.needsKey ? '' : 'unused');
    setAddModelId('');
  };

  const handleShowAdd = () => {
    setShowAdd(true);
    handleProviderChange('openrouter');
  };

  const handleAdd = async () => {
    if (!addModelId.trim()) return;
    setAdding(true);
    setError(null);
    try {
      await addModel({
        provider: addProvider,
        baseUrl: addBaseUrl.trim(),
        apiKey: addApiKey.trim() || 'unused',
        modelId: addModelId.trim(),
        name: addModelId.trim().split('/').pop(),
        enabled: true,
      });
      setShowAdd(false);
      setAddModelId('');
      await load();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to add model.');
    } finally {
      setAdding(false);
    }
  };

  const handleToggle = async (model) => {
    try {
      await updateModel(model._id, { enabled: !model.enabled });
      await load();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update model.');
    }
  };

  const handleSaveKey = async (model) => {
    if (!editKeyValue.trim()) return;
    try {
      await updateModel(model._id, { apiKey: editKeyValue.trim() });
      setEditingKey(null);
      setEditKeyValue('');
      await load();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update API key.');
    }
  };

  const handleDelete = async (model) => {
    try {
      await deleteModel(model._id);
      await load();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to delete model.');
    }
  };

  const handleTest = async (model) => {
    setTesting((prev) => ({ ...prev, [model._id]: true }));
    setTestResults((prev) => ({ ...prev, [model._id]: null }));
    try {
      const result = await testModel(model._id);
      setTestResults((prev) => ({ ...prev, [model._id]: result }));
      // Refresh to get updated lastTest
      await load();
    } catch (err) {
      setTestResults((prev) => ({
        ...prev,
        [model._id]: { success: false, error: err.response?.data?.error || 'Test failed' },
      }));
    } finally {
      setTesting((prev) => ({ ...prev, [model._id]: false }));
    }
  };

  if (loading) {
    return <div className="page"><div className="loading">Loading...</div></div>;
  }

  const enabledCount = models.filter((m) => m.enabled).length;

  return (
    <div className="page">
      <div className="page-header">
        <h1>Models</h1>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="models-summary">
        {models.length === 0
          ? 'No models configured. Add a model to start running AI evaluations.'
          : `${models.length} model${models.length !== 1 ? 's' : ''} configured, ${enabledCount} enabled for evaluation`}
      </div>

      {/* Model list */}
      <div className="models-list">
        {models.map((model) => (
          <div key={model._id} className={`model-card ${model.enabled ? '' : 'model-card--disabled'}`}>
            <div className="model-card-main">
              <div className="model-card-info">
                <div className="model-card-header">
                  <span className={`model-status-dot ${model.lastTest?.success === true ? 'dot-ok' : model.lastTest?.success === false ? 'dot-fail' : 'dot-unknown'}`} />
                  <span className="model-card-id">{model.modelId}</span>
                  <span className={`model-provider-badge badge-${model.provider}`}>{model.provider}</span>
                </div>
                <div className="model-card-detail">
                  {model.baseUrl}
                  {model.provider !== 'ollama' && (
                    <span className="model-card-key">
                      {' — Key: '}
                      {model.apiKey === 'unused' || !model.apiKey
                        ? <span className="key-missing">missing</span>
                        : <span className="key-set">{model.apiKey}</span>}
                      {' '}
                      <button className="btn-link" onClick={() => { setEditingKey(model._id); setEditKeyValue(''); }}>
                        {model.apiKey === 'unused' || !model.apiKey ? 'set' : 'change'}
                      </button>
                    </span>
                  )}
                </div>
                {editingKey === model._id && (
                  <div className="model-key-edit">
                    <input
                      type="password"
                      value={editKeyValue}
                      onChange={(e) => setEditKeyValue(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSaveKey(model)}
                      placeholder="Enter API key"
                      autoFocus
                    />
                    <button className="btn btn-sm btn-save" onClick={() => handleSaveKey(model)} disabled={!editKeyValue.trim()}>Save</button>
                    <button className="btn btn-sm btn-cancel" onClick={() => setEditingKey(null)}>Cancel</button>
                  </div>
                )}
              </div>
              <div className="model-card-actions">
                <label className="model-toggle" title={model.enabled ? 'Enabled for evaluation' : 'Disabled'}>
                  <input
                    type="checkbox"
                    checked={model.enabled}
                    onChange={() => handleToggle(model)}
                  />
                  <span className="model-toggle-label">{model.enabled ? 'On' : 'Off'}</span>
                </label>
                <button
                  className="btn btn-sm btn-test"
                  onClick={() => handleTest(model)}
                  disabled={testing[model._id]}
                >
                  {testing[model._id] ? 'Testing...' : 'Test'}
                </button>
                <button
                  className="btn btn-sm btn-danger"
                  onClick={() => handleDelete(model)}
                >
                  Remove
                </button>
              </div>
            </div>

            {testResults[model._id] && (
              <div className={`model-test-result ${testResults[model._id].success ? 'test-success' : 'test-failure'}`}>
                {testResults[model._id].success
                  ? `Connected — ${testResults[model._id].response}`
                  : `Failed — ${testResults[model._id].error}`}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Add model */}
      {showAdd ? (
        <div className="model-add-form">
          <h3>Add Model</h3>

          <div className="model-add-providers">
            {PROVIDERS.map((p) => (
              <button
                key={p.id}
                className={`btn ${addProvider === p.id ? 'btn-preset-active' : 'btn-preset'}`}
                onClick={() => handleProviderChange(p.id)}
              >
                {p.name}
              </button>
            ))}
          </div>

          <div className="admin-field">
            <label>Base URL</label>
            <input
              type="text"
              value={addBaseUrl}
              onChange={(e) => setAddBaseUrl(e.target.value)}
              placeholder={selectedProvider?.baseUrl}
            />
          </div>

          {selectedProvider?.needsKey && (
            <div className="admin-field">
              <label>API Key</label>
              <input
                type="password"
                value={addApiKey}
                onChange={(e) => setAddApiKey(e.target.value)}
                placeholder="Enter API key"
              />
            </div>
          )}

          <div className="admin-field">
            <label>Model ID</label>
            <input
              type="text"
              value={addModelId}
              onChange={(e) => setAddModelId(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              placeholder={selectedProvider?.suggestions[0] || 'model-name'}
            />
            {selectedProvider && (
              <div className="model-suggestions">
                {selectedProvider.suggestions.map((s) => (
                  <button
                    key={s}
                    className={`btn btn-model-tag ${addModelId === s ? 'btn-model-tag-active' : ''}`}
                    onClick={() => setAddModelId(s)}
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="admin-actions">
            <button
              className="btn btn-save"
              onClick={handleAdd}
              disabled={adding || !addModelId.trim() || !addBaseUrl.trim()}
            >
              {adding ? 'Adding...' : 'Add Model'}
            </button>
            <button className="btn btn-cancel" onClick={() => setShowAdd(false)}>Cancel</button>
          </div>
        </div>
      ) : (
        <button className="btn btn-add-house" onClick={handleShowAdd}>
          + Add Model
        </button>
      )}
    </div>
  );
}

export default Models;
