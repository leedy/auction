import { useState, useEffect, useRef, useCallback, useContext } from 'react';
import AuctionSelector from '../components/AuctionSelector';
import FlaggedCard from '../components/FlaggedCard';
import LotDetail from '../components/LotDetail';
import { getFlaggedByAuction, getSummaryByAuction, getModelsForAuction, runEvaluationForAuction, getEvaluationStatus, getAvailableModels } from '../services/api';
import { AuctionHouseContext } from '../App';

function Flagged() {
  const { ah } = useContext(AuctionHouseContext);
  const [auctionId, setAuctionId] = useState(null);
  const [flagged, setFlagged] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [selectedLotId, setSelectedLotId] = useState(null);
  const [error, setError] = useState(null);
  const [evalStatus, setEvalStatus] = useState(null);
  const [models, setModels] = useState([]);
  const [selectedModel, setSelectedModel] = useState('');  // '' = all
  const [availableModels, setAvailableModels] = useState([]);
  const [auctionRefreshKey, setAuctionRefreshKey] = useState(0);
  const pollRef = useRef(null);

  // Reset when auction house changes
  useEffect(() => {
    setAuctionId(null);
    setFlagged([]);
    setSummary(null);
    setModels([]);
    setAuctionRefreshKey((k) => k + 1);
  }, [ah]);

  const loadModels = useCallback(async (aid) => {
    if (!aid) return;
    try {
      const m = await getModelsForAuction(aid);
      setModels(m);
    } catch {
      // ignore
    }
  }, []);

  const loadData = useCallback((aid, model) => {
    if (!aid) return;
    setLoading(true);
    setError(null);
    const modelFilter = model || undefined;
    Promise.all([getFlaggedByAuction(aid, modelFilter), getSummaryByAuction(aid, modelFilter)])
      .then(([flaggedData, summaryData]) => {
        setFlagged(flaggedData);
        setSummary(summaryData);
      })
      .catch((err) => {
        console.error('Failed to load flagged:', err);
        setError('Failed to load flagged items. Check your connection and try again.');
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadData(auctionId, selectedModel);
  }, [auctionId, selectedModel, loadData]);

  useEffect(() => {
    loadModels(auctionId);
  }, [auctionId, loadModels]);

  // Load available models and check if an evaluation is already running on mount
  useEffect(() => {
    getAvailableModels().then(setAvailableModels).catch(() => {});
    getEvaluationStatus().then((status) => {
      setEvalStatus(status);
      if (status.status === 'running') {
        startPolling();
      }
    }).catch(() => {});
  }, []);

  const startPolling = () => {
    if (pollRef.current) return;
    pollRef.current = setInterval(async () => {
      try {
        const status = await getEvaluationStatus();
        setEvalStatus(status);
        if (status.status !== 'running') {
          stopPolling();
          // Reload data for the current auction
          if (auctionId) {
            loadModels(auctionId);
            loadData(auctionId, selectedModel);
          }
        }
      } catch {
        // ignore polling errors
      }
    }, 2000);
  };

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  useEffect(() => {
    return () => stopPolling();
  }, []);

  const handleRunEvaluation = async () => {
    if (!auctionId) return;
    setError(null);
    try {
      // Run all available models
      const modelsToRun = availableModels.length > 0 ? availableModels.join(',') : undefined;
      await runEvaluationForAuction(auctionId, modelsToRun);
      startPolling();
      setEvalStatus((prev) => ({ ...prev, status: 'running', auctionId, batchesCompleted: 0, totalBatches: 0, lotsProcessed: 0, flaggedCount: 0, errors: [] }));
    } catch (err) {
      const msg = err.response?.data?.error || err.message;
      setError(msg);
    }
  };

  const handleFeedbackSaved = (lotId, feedback) => {
    setFlagged((prev) =>
      prev.map((e) => (e.lotId === lotId ? { ...e, userFeedback: feedback } : e))
    );
  };

  // Group flagged by category
  const byCategory = {};
  for (const item of flagged) {
    const cat = item.category || 'Uncategorized';
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(item);
  }

  const isRunning = evalStatus?.status === 'running';

  return (
    <div className="page">
      <div className="page-header">
        <h1>Flagged Items</h1>
        <AuctionSelector selected={auctionId} onChange={setAuctionId} refreshKey={auctionRefreshKey} ah={ah} />
      </div>

      <div className="page-toolbar">
        <button
          className="btn btn-evaluate"
          onClick={handleRunEvaluation}
          disabled={isRunning || !auctionId}
        >
          {isRunning ? 'Running...' : `Run AI Evaluation${availableModels.length > 1 ? ` (${availableModels.length} models)` : ''}`}
        </button>
        {models.length > 0 && (
          <select
            className="model-filter"
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
          >
            <option value="">All Sources</option>
            {models.map((m) => (
              <option key={m} value={m}>
                {m === 'manual' ? 'My Picks' : m}
              </option>
            ))}
          </select>
        )}
      </div>

      {isRunning && (
        <div className="eval-progress">
          <div className="eval-progress-text">
            {evalStatus.totalBatches > 0
              ? `Evaluating... Batch ${evalStatus.batchesCompleted}/${evalStatus.totalBatches} (${evalStatus.lotsProcessed} lots, ${evalStatus.flaggedCount} flagged)`
              : 'Starting evaluation...'}
          </div>
          {evalStatus.totalBatches > 0 && (
            <div className="eval-progress-bar">
              <div
                className="eval-progress-fill"
                style={{ width: `${(evalStatus.batchesCompleted / evalStatus.totalBatches) * 100}%` }}
              />
            </div>
          )}
        </div>
      )}

      {evalStatus?.status === 'error' && evalStatus.errors?.length > 0 && (
        <div className="error-banner">
          Evaluation error: {evalStatus.errors[evalStatus.errors.length - 1]}
        </div>
      )}

      {summary && !loading && (
        <div className="summary-bar">
          <div className="summary-stat">
            <span className="summary-value summary-value--accent">{summary.totalFlagged}</span>
            <span className="summary-label">Flagged</span>
          </div>
          <div className="summary-stat">
            <span className="summary-value">{summary.totalEvaluated}</span>
            <span className="summary-label">Evaluated</span>
          </div>
          <div className="summary-stat">
            <span className="summary-value">{summary.totalSkipped}</span>
            <span className="summary-label">Skipped</span>
          </div>
        </div>
      )}

      {error && <div className="error-banner">{error}</div>}

      {loading && <div className="loading">Loading...</div>}

      {!loading && flagged.length === 0 && auctionId && !isRunning && (
        <div className="empty-state">No flagged items for this auction{selectedModel ? ` from ${selectedModel === 'manual' ? 'My Picks' : selectedModel}` : ''}.</div>
      )}

      {!loading &&
        Object.entries(byCategory).map(([category, items]) => (
          <div key={category} className="category-section">
            <h2 className="category-header">
              {category}
              <span className="category-count">{items.length}</span>
            </h2>
            {items.map((item) => (
              <FlaggedCard
                key={`${item.lotId}-${item.model}`}
                evaluation={item}
                onFeedbackSaved={handleFeedbackSaved}
                onSelectLot={setSelectedLotId}
              />
            ))}
          </div>
        ))}

      {selectedLotId && (
        <LotDetail lotId={selectedLotId} onClose={() => setSelectedLotId(null)} />
      )}
    </div>
  );
}

export default Flagged;
