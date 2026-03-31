import { useState, useEffect, useMemo, useContext, useRef } from 'react';
import AuctionSelector from '../components/AuctionSelector';
import LotGrid from '../components/LotGrid';
import LotDetail from '../components/LotDetail';
import { getLotsByAuctionId, getEvaluationsByAuction, getPicksByAuction, togglePick, updatePricesByAuction, runEvaluationForAuction, getEvaluationStatus, getAvailableModels, cancelEvaluation } from '../services/api';
import { AuctionHouseContext } from '../App';

function Lots() {
  const { ah, auctionId, setAuctionId } = useContext(AuctionHouseContext);
  const [lots, setLots] = useState([]);
  const [evaluations, setEvaluations] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedLotId, setSelectedLotId] = useState(null);
  const [pickedSet, setPickedSet] = useState(new Set());
  const [showPicksOnly, setShowPicksOnly] = useState(false);
  const [error, setError] = useState(null);
  const [auctionRefreshKey, setAuctionRefreshKey] = useState(0);
  const [updatingPrices, setUpdatingPrices] = useState(false);
  const [priceResult, setPriceResult] = useState(null);
  const [evalStatus, setEvalStatus] = useState(null);
  const [availableModels, setAvailableModels] = useState([]);
  const pollRef = useRef(null);

  // Load available models on mount
  useEffect(() => {
    getAvailableModels().then(setAvailableModels).catch(() => {});
    getEvaluationStatus().then((status) => {
      setEvalStatus(status);
      if (status.status === 'running') startPolling();
    }).catch(() => {});
  }, []);

  // Reset local state when auction house changes
  useEffect(() => {
    setLots([]);
    setEvaluations([]);
    setPriceResult(null);
    setAuctionRefreshKey((k) => k + 1);
  }, [ah]);

  const startPolling = () => {
    if (pollRef.current) return;
    pollRef.current = setInterval(async () => {
      try {
        const status = await getEvaluationStatus();
        setEvalStatus(status);
        if (status.status !== 'running') {
          stopPolling();
          if (auctionId) {
            loadData(auctionId);
          }
        }
      } catch {
        // ignore
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
      const modelsToRun = availableModels.length > 0 ? availableModels.join(',') : undefined;
      await runEvaluationForAuction(auctionId, modelsToRun);
      startPolling();
      setEvalStatus((prev) => ({ ...prev, status: 'running', auctionId, batchesCompleted: 0, totalBatches: 0, lotsProcessed: 0, flaggedCount: 0, errors: [] }));
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    }
  };

  const handleCancelEvaluation = async () => {
    try {
      await cancelEvaluation();
    } catch (err) {
      setError(err.response?.data?.error || err.message);
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
      const lotsData = await getLotsByAuctionId(auctionId);
      setLots(lotsData);
    } catch (err) {
      setError('Price update failed: ' + (err.response?.data?.error || err.message));
    } finally {
      setUpdatingPrices(false);
    }
  };

  const loadData = (aid) => {
    if (!aid) return;
    setLoading(true);
    setError(null);
    Promise.all([
      getLotsByAuctionId(aid),
      getEvaluationsByAuction(aid),
      getPicksByAuction(aid),
    ])
      .then(([lotsData, evalsData, picksData]) => {
        setLots(lotsData);
        setEvaluations(evalsData);
        setPickedSet(new Set(picksData.map((p) => p.lotId)));
      })
      .catch((err) => {
        console.error('Failed to load lots:', err);
        setError('Failed to load lots. Check your connection and try again.');
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadData(auctionId);
  }, [auctionId]);

  const handleTogglePick = async (lotId, auctionIdParam) => {
    try {
      const lot = lots.find((l) => l.lotId === lotId);
      const result = await togglePick(lotId, auctionIdParam, lot?.weekOf);
      setPickedSet((prev) => {
        const next = new Set(prev);
        if (result.picked) {
          next.add(lotId);
        } else {
          next.delete(lotId);
        }
        return next;
      });
    } catch (err) {
      console.error('Failed to toggle pick:', err);
    }
  };

  const [sortBy, setSortBy] = useState('lotNumber');

  const filtered = useMemo(() => {
    let result = lots;
    if (showPicksOnly) {
      result = result.filter((lot) => pickedSet.has(lot.lotId));
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (lot) =>
          lot.title?.toLowerCase().includes(q) ||
          lot.description?.toLowerCase().includes(q) ||
          lot.lotNumber?.toLowerCase().includes(q)
      );
    }
    return [...result].sort((a, b) => {
      if (sortBy === 'priceHigh') return (b.highBid || 0) - (a.highBid || 0);
      if (sortBy === 'priceLow') return (a.highBid || 0) - (b.highBid || 0);
      return (parseInt(a.lotNumber, 10) || 0) - (parseInt(b.lotNumber, 10) || 0);
    });
  }, [lots, search, showPicksOnly, pickedSet, sortBy]);

  const isRunning = evalStatus?.status === 'running' || evalStatus?.status === 'cancelling';

  return (
    <div className="page">
      <div className="page-header">
        <h1>All Lots</h1>
        <AuctionSelector selected={auctionId} onChange={setAuctionId} refreshKey={auctionRefreshKey} ah={ah} />
      </div>

      <div className="page-toolbar">
        <input
          type="text"
          className="search-input"
          placeholder="Search lots..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button
          className={`btn btn-filter-picks ${showPicksOnly ? 'filter-active' : ''}`}
          onClick={() => setShowPicksOnly((v) => !v)}
        >
          {'\u2605'} My Picks{pickedSet.size > 0 ? ` (${pickedSet.size})` : ''}
        </button>
        <button
          className="btn btn-evaluate"
          onClick={handleRunEvaluation}
          disabled={isRunning || !auctionId}
        >
          {isRunning ? 'Running...' : `Run AI Evaluation${availableModels.length > 1 ? ` (${availableModels.length} models)` : ''}`}
        </button>
        <button
          className="btn btn-update-prices"
          onClick={handleUpdatePrices}
          disabled={updatingPrices || !auctionId}
        >
          {updatingPrices ? 'Updating...' : 'Update Prices'}
        </button>
        <select className="sort-select" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
          <option value="lotNumber">Sort: Lot #</option>
          <option value="priceHigh">Sort: Price High</option>
          <option value="priceLow">Sort: Price Low</option>
        </select>
        <div className="lot-count">
          {loading ? 'Loading...' : `${filtered.length} of ${lots.length} lots`}
        </div>
      </div>

      {isRunning && (
        <div className="eval-progress">
          <div className="eval-progress-header">
            <div className="eval-progress-text">
              {evalStatus.status === 'cancelling'
                ? 'Cancelling... waiting for current batch to finish'
                : evalStatus.totalBatches > 0
                ? <>
                    Evaluating: {evalStatus.lotsProcessed}/{evalStatus.totalLots} lots
                    {' '}(batch {evalStatus.batchesCompleted}/{evalStatus.totalBatches})
                    {evalStatus.flaggedCount > 0 && ` — ${evalStatus.flaggedCount} flagged`}
                    {evalStatus.lotsPerMinute && ` — ${evalStatus.lotsPerMinute} lots/min`}
                    {evalStatus.model && <span className="eval-model-name"> — {evalStatus.model.split('/').pop()}</span>}
                  </>
                : 'Starting evaluation...'}
            </div>
            {evalStatus.status !== 'cancelling' && (
              <button className="btn btn-sm btn-cancel-eval" onClick={handleCancelEvaluation}>
                Cancel
              </button>
            )}
          </div>
          {evalStatus.totalLots > 0 && (
            <div className="eval-progress-bar">
              <div
                className="eval-progress-fill"
                style={{ width: `${(evalStatus.lotsProcessed / evalStatus.totalLots) * 100}%` }}
              />
            </div>
          )}
        </div>
      )}

      {evalStatus?.status === 'cancelled' && (
        <div className="scrape-banner">
          Evaluation cancelled — {evalStatus.lotsProcessed} lots processed, {evalStatus.flaggedCount} flagged
        </div>
      )}

      {evalStatus?.status === 'error' && evalStatus.errors?.length > 0 && (
        <div className="error-banner">
          Evaluation error: {evalStatus.errors[evalStatus.errors.length - 1]}
        </div>
      )}

      {priceResult && (
        <div className="scrape-banner">
          {priceResult.withPrices > 0
            ? `Updated ${priceResult.updated} lots with final prices (${priceResult.withPrices} sold)`
            : priceResult.source === 'current' && priceResult.withBids > 0
            ? `Updated ${priceResult.updated} lots with current bids (${priceResult.withBids} with bids)`
            : priceResult.message || 'No price data available yet'}
        </div>
      )}

      {error && <div className="error-banner">{error}</div>}

      {!loading && !error && (
        <LotGrid
          lots={filtered}
          evaluations={evaluations}
          onSelectLot={setSelectedLotId}
          pickedSet={pickedSet}
          onTogglePick={handleTogglePick}
        />
      )}

      {selectedLotId && (
        <LotDetail
          lotId={selectedLotId}
          onClose={() => setSelectedLotId(null)}
          isPicked={pickedSet.has(selectedLotId)}
          onTogglePick={handleTogglePick}
        />
      )}
    </div>
  );
}

export default Lots;
