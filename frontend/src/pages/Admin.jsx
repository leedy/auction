import { useState, useEffect, useContext } from 'react';
import { getSettings, updateSettings, testLLMConnection, getAuctionHouses, createAuctionHouse, updateAuctionHouse, deleteAuctionHouse } from '../services/api';
import { AuctionHouseContext } from '../App';

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

const DAYS_OF_WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function Admin() {
  const { refreshHouses } = useContext(AuctionHouseContext);
  const [houses, setHouses] = useState([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newHouse, setNewHouse] = useState({ name: '', subdomain: '', auctionDay: 'Thursday' });
  const [houseSaving, setHouseSaving] = useState(false);
  const [houseError, setHouseError] = useState(null);

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

  const loadHouses = async () => {
    try {
      const data = await getAuctionHouses();
      setHouses(data);
    } catch {
      // ignore
    }
  };

  const handleAddHouse = async () => {
    setHouseSaving(true);
    setHouseError(null);
    try {
      const slug = newHouse.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      let subdomain = newHouse.subdomain.replace(/^https?:\/\//, '').replace(/\/+$/, '');
      if (!subdomain.includes('.')) subdomain = `${subdomain}.hibid.com`;
      await createAuctionHouse({
        slug,
        name: newHouse.name,
        subdomain,
        auctionDay: newHouse.auctionDay,
      });
      setNewHouse({ name: '', subdomain: '', auctionDay: 'Thursday' });
      setShowAddForm(false);
      await loadHouses();
      refreshHouses();
    } catch (err) {
      setHouseError(err.response?.data?.error || 'Failed to add auction house.');
    } finally {
      setHouseSaving(false);
    }
  };

  const handleToggleHouse = async (slug, active) => {
    try {
      await updateAuctionHouse(slug, { active: !active });
      await loadHouses();
      refreshHouses();
    } catch {
      // ignore
    }
  };

  const handleDeleteHouse = async (slug) => {
    try {
      await deleteAuctionHouse(slug);
      await loadHouses();
      refreshHouses();
    } catch (err) {
      setHouseError(err.response?.data?.error || 'Failed to delete auction house.');
    }
  };

  useEffect(() => {
    loadSettings();
    loadHouses();
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
        <h2>Auction Houses</h2>
        <p className="admin-section-desc">
          Manage HiBid auction houses to monitor. Each house has its own subdomain and auction schedule.
        </p>

        <div className="ah-list">
          {houses.map((house) => (
            <div key={house.slug} className={`ah-list-item ${house.active ? '' : 'ah-inactive'}`}>
              <div className="ah-list-info">
                <span className="ah-list-name">{house.name}</span>
                <span className="ah-list-detail">{house.subdomain} &middot; {house.auctionDay}s</span>
              </div>
              <div className="ah-list-actions">
                <button
                  className="btn btn-sm"
                  onClick={() => handleToggleHouse(house.slug, house.active)}
                >
                  {house.active ? 'Disable' : 'Enable'}
                </button>
                <button
                  className="btn btn-sm btn-danger"
                  onClick={() => handleDeleteHouse(house.slug)}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>

        {houseError && <div className="error-banner">{houseError}</div>}

        {showAddForm ? (
          <div className="ah-add-form">
            <div className="admin-field">
              <label>Name</label>
              <input
                type="text"
                value={newHouse.name}
                onChange={(e) => setNewHouse({ ...newHouse, name: e.target.value })}
                placeholder="e.g. Kleinfelter's"
              />
            </div>
            <div className="admin-field">
              <label>HiBid Subdomain</label>
              <input
                type="text"
                value={newHouse.subdomain}
                onChange={(e) => setNewHouse({ ...newHouse, subdomain: e.target.value })}
                placeholder="e.g. kleinfelters"
              />
              <span className="field-hint">Just the subdomain name, or full domain (e.g. kleinfelters.hibid.com)</span>
            </div>
            <div className="admin-field">
              <label>Auction Day</label>
              <select
                value={newHouse.auctionDay}
                onChange={(e) => setNewHouse({ ...newHouse, auctionDay: e.target.value })}
              >
                {DAYS_OF_WEEK.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
            <div className="admin-actions">
              <button
                className="btn btn-save"
                onClick={handleAddHouse}
                disabled={houseSaving || !newHouse.name || !newHouse.subdomain}
              >
                {houseSaving ? 'Adding...' : 'Add Auction House'}
              </button>
              <button className="btn btn-cancel" onClick={() => setShowAddForm(false)}>Cancel</button>
            </div>
          </div>
        ) : (
          <button className="btn btn-add-house" onClick={() => setShowAddForm(true)}>
            + Add Auction House
          </button>
        )}
      </div>

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
