import { useState, useEffect, useCallback, useContext } from 'react';
import AuctionSelector from '../components/AuctionSelector';
import FlaggedCard from '../components/FlaggedCard';
import LotDetail from '../components/LotDetail';
import { getFlaggedByAuction, getSummaryByAuction, getModelsForAuction } from '../services/api';
import { AuctionHouseContext } from '../App';

function Flagged() {
  const { ah } = useContext(AuctionHouseContext);
  const [auctionId, setAuctionId] = useState(null);
  const [flagged, setFlagged] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [selectedLotId, setSelectedLotId] = useState(null);
  const [error, setError] = useState(null);
  const [models, setModels] = useState([]);
  const [selectedModel, setSelectedModel] = useState('');  // '' = all
  const [auctionRefreshKey, setAuctionRefreshKey] = useState(0);

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

  return (
    <div className="page">
      <div className="page-header">
        <h1>Flagged Items</h1>
        <AuctionSelector selected={auctionId} onChange={setAuctionId} refreshKey={auctionRefreshKey} ah={ah} />
      </div>

      <div className="page-toolbar">
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

      {!loading && flagged.length === 0 && auctionId && (
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
