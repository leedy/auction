import { useState, useEffect, useRef, useCallback } from 'react';
import WeekSelector from '../components/WeekSelector';
import FlaggedCard from '../components/FlaggedCard';
import LotDetail from '../components/LotDetail';
import { getFlagged, getSummary, getModelsForWeek, runEvaluation, getEvaluationStatus } from '../services/api';

function Flagged() {
  const [weekOf, setWeekOf] = useState(null);
  const [flagged, setFlagged] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [selectedLotId, setSelectedLotId] = useState(null);
  const [error, setError] = useState(null);
  const [evalStatus, setEvalStatus] = useState(null);
  const [models, setModels] = useState([]);
  const [selectedModel, setSelectedModel] = useState('');  // '' = all
  const pollRef = useRef(null);

  const loadModels = useCallback(async (week) => {
    if (!week) return;
    try {
      const m = await getModelsForWeek(week);
      setModels(m);
    } catch {
      // ignore
    }
  }, []);

  const loadData = useCallback((week, model) => {
    if (!week) return;
    setLoading(true);
    setError(null);
    const modelFilter = model || undefined;
    Promise.all([getFlagged(week, modelFilter), getSummary(week, modelFilter)])
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
    loadData(weekOf, selectedModel);
  }, [weekOf, selectedModel, loadData]);

  useEffect(() => {
    loadModels(weekOf);
  }, [weekOf, loadModels]);

  // Check if an evaluation is already running on mount
  useEffect(() => {
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
          if (status.weekOf) {
            loadModels(status.weekOf);
            loadData(status.weekOf, selectedModel);
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
    if (!weekOf) return;
    setError(null);
    try {
      await runEvaluation(weekOf);
      startPolling();
      setEvalStatus((prev) => ({ ...prev, status: 'running', weekOf, batchesCompleted: 0, totalBatches: 0, lotsProcessed: 0, flaggedCount: 0, errors: [] }));
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
        <WeekSelector selected={weekOf} onChange={setWeekOf} />
      </div>

      <div className="page-toolbar">
        <button
          className="btn btn-evaluate"
          onClick={handleRunEvaluation}
          disabled={isRunning || !weekOf}
        >
          {isRunning ? 'Running...' : 'Run AI Evaluation'}
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
        {evalStatus?.model && evalStatus.status !== 'idle' && (
          <span className="eval-model-tag">{evalStatus.model}</span>
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
          <span className="summary-stat">
            <strong>{summary.totalFlagged}</strong> flagged
          </span>
          <span className="summary-stat">
            out of <strong>{summary.totalEvaluated}</strong> evaluated
          </span>
          <span className="summary-stat">
            <strong>{summary.totalSkipped}</strong> skipped
          </span>
        </div>
      )}

      {error && <div className="error-banner">{error}</div>}

      {loading && <div className="loading">Loading...</div>}

      {!loading && flagged.length === 0 && weekOf && !isRunning && (
        <div className="empty-state">No flagged items for this week{selectedModel ? ` from ${selectedModel === 'manual' ? 'My Picks' : selectedModel}` : ''}.</div>
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
