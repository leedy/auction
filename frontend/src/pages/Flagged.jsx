import { useState, useEffect, useCallback, useContext, useMemo } from 'react';
import AuctionSelector from '../components/AuctionSelector';
import FlaggedCard from '../components/FlaggedCard';
import LotDetail from '../components/LotDetail';
import { getFlaggedByAuction, getSummaryByAuction, getModelsForAuction, updatePricesByAuction, getPicksByAuction, togglePick } from '../services/api';
import { AuctionHouseContext } from '../App';

function Flagged() {
  const { ah, auctionId, setAuctionId } = useContext(AuctionHouseContext);
  const [flagged, setFlagged] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [selectedLotId, setSelectedLotId] = useState(null);
  const [error, setError] = useState(null);
  const [models, setModels] = useState([]);
  const [selectedModel, setSelectedModel] = useState('');  // '' = all
  const [auctionRefreshKey, setAuctionRefreshKey] = useState(0);
  const [updatingPrices, setUpdatingPrices] = useState(false);
  const [priceResult, setPriceResult] = useState(null);
  const [pickedSet, setPickedSet] = useState(new Set());

  // Reset local state when auction house changes
  useEffect(() => {
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
    if (auctionId) {
      getPicksByAuction(auctionId).then((picks) => setPickedSet(new Set(picks.map((p) => p.lotId)))).catch(() => {});
    }
  }, [auctionId, loadModels]);

  const handleTogglePick = async (lotId) => {
    try {
      const result = await togglePick(lotId, auctionId);
      setPickedSet((prev) => {
        const next = new Set(prev);
        if (result.picked) next.add(lotId);
        else next.delete(lotId);
        return next;
      });
      // Reload so the item appears in / disappears from My Picks
      loadData(auctionId, selectedModel);
    } catch (err) {
      console.error('Failed to toggle pick:', err);
    }
  };

  const handleUpdatePrices = async () => {
    if (!auctionId) return;
    setUpdatingPrices(true);
    setPriceResult(null);
    setError(null);
    try {
      const result = await updatePricesByAuction(auctionId);
      setPriceResult(result);
      // Reload flagged data to show updated prices
      loadData(auctionId, selectedModel);
    } catch (err) {
      setError('Price update failed: ' + (err.response?.data?.error || err.message));
    } finally {
      setUpdatingPrices(false);
    }
  };

  const [sortBy, setSortBy] = useState('category');

  const handleFeedbackSaved = (lotId, feedback) => {
    if (feedback === 'not_interested') {
      setFlagged((prev) => prev.filter((e) => e.lotId !== lotId));
    } else {
      setFlagged((prev) =>
        prev.map((e) => (e.lotId === lotId ? { ...e, userFeedback: feedback } : e))
      );
    }
  };

  const sortedFlagged = useMemo(() => {
    if (sortBy === 'lotNumber') {
      return [...flagged].sort((a, b) => (parseInt(a.lotNumber, 10) || 0) - (parseInt(b.lotNumber, 10) || 0));
    }
    return flagged;
  }, [flagged, sortBy]);

  // Group flagged by category (only used when sortBy === 'category')
  const byCategory = useMemo(() => {
    const groups = {};
    for (const item of sortedFlagged) {
      const isManual = item.model === 'manual' || item.models?.includes('manual');
      const cat = isManual ? 'My Picks' : (item.category || 'Uncategorized');
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(item);
    }
    // Sort entries: My Picks first, then alphabetical
    return Object.fromEntries(
      Object.entries(groups).sort(([a], [b]) => {
        if (a === 'My Picks') return -1;
        if (b === 'My Picks') return 1;
        return a.localeCompare(b);
      })
    );
  }, [sortedFlagged]);

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
        <select className="sort-select" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
          <option value="category">Sort: Category</option>
          <option value="lotNumber">Sort: Lot #</option>
        </select>
        <button
          className="btn btn-update-prices"
          onClick={handleUpdatePrices}
          disabled={updatingPrices || !auctionId}
        >
          {updatingPrices ? 'Updating...' : 'Update Prices'}
        </button>
      </div>

      {priceResult && (
        <div className="scrape-banner">
          {priceResult.withPrices > 0
            ? `Updated ${priceResult.updated} lots with final prices (${priceResult.withPrices} sold)`
            : priceResult.source === 'current' && priceResult.withBids > 0
            ? `Updated ${priceResult.updated} lots with current bids (${priceResult.withBids} with bids)`
            : priceResult.message || 'No price data available yet'}
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

      {!loading && flagged.length === 0 && auctionId && (
        <div className="empty-state">No flagged items for this auction{selectedModel ? ` from ${selectedModel === 'manual' ? 'My Picks' : selectedModel}` : ''}.</div>
      )}

      {!loading && sortBy === 'lotNumber' && sortedFlagged.map((item) => (
        <FlaggedCard
          key={`${item.lotId}-${item.model}`}
          evaluation={item}
          onFeedbackSaved={handleFeedbackSaved}
          onSelectLot={setSelectedLotId}
          isPicked={pickedSet.has(item.lotId)}
          onTogglePick={handleTogglePick}
        />
      ))}

      {!loading && sortBy === 'category' &&
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
                isPicked={pickedSet.has(item.lotId)}
                onTogglePick={handleTogglePick}
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
