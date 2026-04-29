import { useState, useEffect, useCallback, useContext, useMemo } from 'react';
import AuctionSelector from '../components/AuctionSelector';
import FlaggedCard from '../components/FlaggedCard';
import LotDetail from '../components/LotDetail';
import { getFlaggedByAuction, getSummaryByAuction, getModelsForAuction, updatePricesByAuction, getPicksByAuction, getAllPicks, togglePick, getOpenFlaggedLots } from '../services/api';
import { AuctionHouseContext } from '../App';

function Flagged() {
  const { ah, auctionId, setAuctionId } = useContext(AuctionHouseContext);
  const [viewMode, setViewMode] = useState('auction'); // 'open' | 'auction'
  const [flagged, setFlagged] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [selectedLotId, setSelectedLotId] = useState(null);
  const [error, setError] = useState(null);
  const [models, setModels] = useState([]);
  const [selectedModel, setSelectedModel] = useState('');
  const [auctionRefreshKey, setAuctionRefreshKey] = useState(0);
  const [updatingPrices, setUpdatingPrices] = useState(false);
  const [priceResult, setPriceResult] = useState(null);
  const [pickedSet, setPickedSet] = useState(new Set());
  const [sortBy, setSortBy] = useState('category');

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

  const loadOpenData = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setLoading(true);
    setError(null);
    try {
      const [flaggedData, picks] = await Promise.all([getOpenFlaggedLots(), getAllPicks()]);
      setFlagged(flaggedData);
      setSummary(null);
      setPickedSet(new Set(picks.map((p) => p.lotId)));
    } catch (err) {
      console.error('Failed to load open flagged:', err);
      setError('Failed to load open flagged items.');
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

  const loadAuctionData = useCallback((aid, model, { quiet = false } = {}) => {
    if (!aid) return;
    if (!quiet) setLoading(true);
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
      .finally(() => {
        if (!quiet) setLoading(false);
      });
  }, []);

  useEffect(() => {
    if (viewMode === 'open') {
      loadOpenData();
    } else {
      loadAuctionData(auctionId, selectedModel);
    }
  }, [viewMode, auctionId, selectedModel, loadOpenData, loadAuctionData]);

  useEffect(() => {
    if (viewMode === 'auction') {
      loadModels(auctionId);
      if (auctionId) {
        getPicksByAuction(auctionId).then((picks) => setPickedSet(new Set(picks.map((p) => p.lotId)))).catch(() => {});
      }
    }
  }, [viewMode, auctionId, loadModels]);

  const handleTogglePick = async (lotId, lotAuctionId) => {
    const aid = lotAuctionId ?? auctionId;
    try {
      const result = await togglePick(lotId, aid);
      setPickedSet((prev) => {
        const next = new Set(prev);
        if (result.picked) next.add(lotId);
        else next.delete(lotId);
        return next;
      });
      if (viewMode === 'open') {
        loadOpenData({ quiet: true });
      } else {
        loadAuctionData(auctionId, selectedModel, { quiet: true });
      }
    } catch (err) {
      console.error('Failed to toggle pick:', err);
    }
  };

  const handleUpdatePrices = async () => {
    if (!auctionId || viewMode === 'open') return;
    setUpdatingPrices(true);
    setPriceResult(null);
    setError(null);
    try {
      const result = await updatePricesByAuction(auctionId);
      setPriceResult(result);
      loadAuctionData(auctionId, selectedModel);
    } catch (err) {
      setError('Price update failed: ' + (err.response?.data?.error || err.message));
    } finally {
      setUpdatingPrices(false);
    }
  };

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

  // Group by category within a set of items (used for both views)
  const groupByCategory = (items) => {
    const groups = {};
    for (const item of items) {
      const isManual = item.model === 'manual' || item.models?.includes('manual');
      const cat = isManual ? 'My Picks' : (item.category || 'Uncategorized');
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(item);
    }
    return Object.fromEntries(
      Object.entries(groups).sort(([a], [b]) => {
        if (a === 'My Picks') return -1;
        if (b === 'My Picks') return 1;
        return a.localeCompare(b);
      })
    );
  };

  // For "By Auction" mode with category sort
  const byCategory = useMemo(() => groupByCategory(sortedFlagged), [sortedFlagged]);

  // For "All Open" mode — group by auction
  const byAuctionGroup = useMemo(() => {
    if (viewMode !== 'open') return [];
    const groups = new Map();
    for (const item of sortedFlagged) {
      const key = item.auctionId;
      if (!groups.has(key)) {
        groups.set(key, {
          auctionId: item.auctionId,
          auctionName: item.auctionName,
          auctionHouseName: item.auctionHouseName,
          bidCloseDateTime: item.bidCloseDateTime,
          items: [],
        });
      }
      groups.get(key).items.push(item);
    }
    const result = [...groups.values()];
    if (sortBy === 'closeDate') {
      result.sort((a, b) => {
        const ta = a.bidCloseDateTime ? new Date(a.bidCloseDateTime).getTime() : Infinity;
        const tb = b.bidCloseDateTime ? new Date(b.bidCloseDateTime).getTime() : Infinity;
        return ta - tb;
      });
    }
    return result;
  }, [sortedFlagged, viewMode, sortBy]);

  const renderCard = (item) => (
    <FlaggedCard
      key={`${item.lotId}-${item.model}`}
      evaluation={item}
      onFeedbackSaved={handleFeedbackSaved}
      onSelectLot={setSelectedLotId}
      isPicked={pickedSet.has(item.lotId)}
      onTogglePick={(lotId) => handleTogglePick(lotId, item.auctionId)}
      auctionLabel={viewMode === 'open' && item.auctionHouseName
        ? `${item.auctionHouseName}${item.auctionName ? ' · ' + item.auctionName : ''}`
        : null}
    />
  );

  return (
    <div className="page">
      <div className="page-header">
        <h1>Flagged Items</h1>
        <div className="view-toggle">
          <button
            className={`view-toggle-btn${viewMode === 'open' ? ' active' : ''}`}
            onClick={() => setViewMode('open')}
          >
            All Open
          </button>
          <button
            className={`view-toggle-btn${viewMode === 'auction' ? ' active' : ''}`}
            onClick={() => setViewMode('auction')}
          >
            By Auction
          </button>
        </div>
      </div>

      <div className="page-toolbar">
        {viewMode === 'auction' && (
          <AuctionSelector selected={auctionId} onChange={setAuctionId} refreshKey={auctionRefreshKey} ah={ah} />
        )}
        {viewMode === 'auction' && models.length > 0 && (
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
          {viewMode === 'open' && <option value="closeDate">Sort: Close Date</option>}
        </select>
        {viewMode === 'open' && (
          <button className="btn btn-update-prices" onClick={loadOpenData} disabled={loading}>
            {loading ? 'Loading...' : 'Refresh'}
          </button>
        )}
        {viewMode === 'auction' && (
          <button
            className="btn btn-update-prices"
            onClick={handleUpdatePrices}
            disabled={updatingPrices || !auctionId}
          >
            {updatingPrices ? 'Updating...' : 'Update Prices'}
          </button>
        )}
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

      {summary && !loading && viewMode === 'auction' && (
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

      {viewMode === 'open' && !loading && (
        <div className="summary-bar">
          <div className="summary-stat">
            <span className="summary-value summary-value--accent">{flagged.length}</span>
            <span className="summary-label">Open Flagged</span>
          </div>
          <div className="summary-stat">
            <span className="summary-value">{byAuctionGroup.length}</span>
            <span className="summary-label">Auctions</span>
          </div>
        </div>
      )}

      {error && <div className="error-banner">{error}</div>}
      {loading && <div className="loading">Loading...</div>}

      {/* All Open mode */}
      {!loading && viewMode === 'open' && flagged.length === 0 && (
        <div className="empty-state">No open flagged lots found.</div>
      )}

      {!loading && viewMode === 'open' && byAuctionGroup.map((group) => {
        const groupItems = group.items;
        return (
          <div key={group.auctionId} className="auction-group">
            <h2 className="auction-group-header">
              <span className="auction-group-house">{group.auctionHouseName || 'Unknown House'}</span>
              {group.auctionName && (
                <span className="auction-group-name">{group.auctionName}</span>
              )}
              {group.bidCloseDateTime && (
                <span className="auction-group-close">
                  Closes {new Date(group.bidCloseDateTime).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                </span>
              )}
              <span className="category-count">{groupItems.length}</span>
            </h2>
            {sortBy === 'lotNumber' || sortBy === 'closeDate'
              ? groupItems.map((item) => renderCard(item))
              : Object.entries(groupByCategory(groupItems)).map(([category, items]) => (
                  <div key={category} className="category-section">
                    <h3 className="category-header">
                      {category}
                      <span className="category-count">{items.length}</span>
                    </h3>
                    {items.map((item) => renderCard(item))}
                  </div>
                ))
            }
          </div>
        );
      })}

      {/* By Auction mode */}
      {!loading && viewMode === 'auction' && flagged.length === 0 && auctionId && (
        <div className="empty-state">No flagged items for this auction{selectedModel ? ` from ${selectedModel === 'manual' ? 'My Picks' : selectedModel}` : ''}.</div>
      )}

      {!loading && viewMode === 'auction' && sortBy === 'lotNumber' && sortedFlagged.map((item) => renderCard(item))}

      {!loading && viewMode === 'auction' && sortBy === 'category' &&
        Object.entries(byCategory).map(([category, items]) => (
          <div key={category} className="category-section">
            <h2 className="category-header">
              {category}
              <span className="category-count">{items.length}</span>
            </h2>
            {items.map((item) => renderCard(item))}
          </div>
        ))}

      {selectedLotId && (
        <LotDetail lotId={selectedLotId} onClose={() => setSelectedLotId(null)} />
      )}
    </div>
  );
}

export default Flagged;
