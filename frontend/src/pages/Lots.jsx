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
  const [showFlaggedOnly, setShowFlaggedOnly] = useState(false);
  const [error, setError] = useState(null);
  const [auctionRefreshKey, setAuctionRefreshKey] = useState(0);
  const [updatingPrices, setUpdatingPrices] = useState(false);
  const [priceResult, setPriceResult] = useState(null);
  const [evalStatus, setEvalStatus] = useState(null);
  const [availableModels, setAvailableModels] = useState([]);
  const pollRef = useRef(null);

  // Global eval queue: [{auctionId, models}]
  // Stored in both state (rendering) and ref (polling closure access)
  const [evalQueue, setEvalQueue] = useState([]);
  const evalQueueRef = useRef([]);
  const auctionIdRef = useRef(auctionId);

  // Keep refs in sync
  useEffect(() => { auctionIdRef.current = auctionId; }, [auctionId]);

  const updateQueue = (fn) => {
    setEvalQueue((prev) => {
      const next = typeof fn === 'function' ? fn(prev) : fn;
      evalQueueRef.current = next;
      return next;
    });
  };

  // Load available models on mount
  useEffect(() => {
    getAvailableModels().then(setAvailableModels).catch(() => {});
    getEvaluationStatus().then((status) => {
      setEvalStatus(status);
      if (status.status === 'running' || status.status === 'cancelling') startPolling();
    }).catch(() => {});
  }, []);

  // Reset local state when auction house changes
  useEffect(() => {
    setLots([]);
    setEvaluations([]);
    setPriceResult(null);
    setAuctionRefreshKey((k) => k + 1);
  }, [ah]);

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const startPolling = () => {
    if (pollRef.current) return;
    pollRef.current = setInterval(async () => {
      try {
        const status = await getEvaluationStatus();
        setEvalStatus(status);
        if (status.status !== 'running' && status.status !== 'cancelling') {
          stopPolling();

          // Reload data only if we're viewing the auction that just finished
          const finishedAid = status.auctionId;
          const currentAid = auctionIdRef.current;
          if (finishedAid && finishedAid === currentAid) {
            loadData(currentAid);
          }

          // Auto-start next in queue
          const queue = evalQueueRef.current;
          if (queue.length > 0) {
            const [next, ...rest] = queue;
            evalQueueRef.current = rest;
            setEvalQueue(rest);
            runEvaluationForAuction(next.auctionId, next.models)
              .then(() => {
                setEvalStatus({ status: 'running', auctionId: next.auctionId, batchesCompleted: 0, totalBatches: 0, lotsProcessed: 0, flaggedCount: 0, errors: [] });
                startPolling();
              })
              .catch((err) => setError(err.response?.data?.error || err.message));
          }
        }
      } catch {
        // ignore
      }
    }, 2000);
  };

  useEffect(() => {
    return () => stopPolling();
  }, []);

  const handleRunEvaluation = async () => {
    if (!auctionId) return;
    setError(null);
    const models = availableModels.length > 0 ? availableModels.join(',') : undefined;

    if (isRunning) {
      // Add to queue if not already queued
      updateQueue((prev) => {
        if (prev.some((item) => item.auctionId === auctionId)) return prev;
        return [...prev, { auctionId, models }];
      });
      return;
    }

    try {
      await runEvaluationForAuction(auctionId, models);
      startPolling();
      setEvalStatus((prev) => ({ ...prev, status: 'running', auctionId, batchesCompleted: 0, totalBatches: 0, lotsProcessed: 0, flaggedCount: 0, errors: [] }));
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    }
  };

  const handleDequeue = (aid) => {
    updateQueue((prev) => prev.filter((item) => item.auctionId !== aid));
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

  const flaggedSet = useMemo(
    () => new Set(evaluations.filter((e) => e.interested).map((e) => e.lotId)),
    [evaluations]
  );

  const filtered = useMemo(() => {
    let result = lots;
    if (showPicksOnly) {
      result = result.filter((lot) => pickedSet.has(lot.lotId));
    }
    if (showFlaggedOnly) {
      result = result.filter((lot) => flaggedSet.has(lot.lotId));
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
      const priceA = a.priceRealized ?? a.highBid ?? 0;
      const priceB = b.priceRealized ?? b.highBid ?? 0;
      if (sortBy === 'priceHigh') return priceB - priceA;
      if (sortBy === 'priceLow') return priceA - priceB;
      return (parseInt(a.lotNumber, 10) || 0) - (parseInt(b.lotNumber, 10) || 0);
    });
  }, [lots, search, showPicksOnly, pickedSet, showFlaggedOnly, flaggedSet, sortBy]);

  // Derived eval state for this specific auction
  const isRunning = evalStatus?.status === 'running' || evalStatus?.status === 'cancelling';
  const thisAuctionRunning = isRunning && evalStatus?.auctionId === auctionId;
  const queueIndex = evalQueue.findIndex((item) => item.auctionId === auctionId);
  const thisAuctionQueued = queueIndex !== -1;
  const queueTotal = evalQueue.length;

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
          className={`btn btn-filter-picks ${showFlaggedOnly ? 'filter-active' : ''}`}
          onClick={() => setShowFlaggedOnly((v) => !v)}
          disabled={flaggedSet.size === 0}
          title={flaggedSet.size === 0 ? 'No AI-flagged items for this auction' : 'Show only AI-flagged items'}
        >
          {'⚑'} Flagged{flaggedSet.size > 0 ? ` (${flaggedSet.size})` : ''}
        </button>

        {thisAuctionQueued ? (
          <button
            className="btn btn-queued"
            onClick={() => handleDequeue(auctionId)}
            title="Click to remove from queue"
          >
            Queued ({queueIndex + 1} of {queueTotal}) — Remove
          </button>
        ) : thisAuctionRunning ? (
          <button className="btn btn-evaluate" disabled>
            Running...
          </button>
        ) : (
          <button
            className="btn btn-evaluate"
            onClick={handleRunEvaluation}
            disabled={!auctionId}
          >
            {isRunning
              ? 'Queue for Evaluation'
              : `Run AI Evaluation${availableModels.length > 1 ? ` (${availableModels.length} models)` : ''}`}
          </button>
        )}

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
        {!loading && evaluations.length > 0 && (() => {
          const flaggedCount = evaluations.filter((e) => e.interested).length;
          return flaggedCount > 0 ? (
            <div className="flagged-count">
              {flaggedCount} flagged
            </div>
          ) : (
            <div className="flagged-count flagged-count-none">
              AI ran — 0 flagged
            </div>
          );
        })()}
      </div>

      {/* Progress bar — only for the currently running auction */}
      {thisAuctionRunning && (
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

      {/* Running elsewhere notice */}
      {isRunning && !thisAuctionRunning && !thisAuctionQueued && (
        <div className="eval-elsewhere-notice">
          AI evaluation is running for another auction — use "Queue for Evaluation" to add this one next.
        </div>
      )}

      {/* Queued notice */}
      {thisAuctionQueued && (
        <div className="eval-queue-banner">
          <span>In queue — position {queueIndex + 1} of {queueTotal} — will start automatically when the current evaluation finishes.</span>
          <button className="btn btn-sm btn-dequeue" onClick={() => handleDequeue(auctionId)}>Remove from Queue</button>
        </div>
      )}

      {evalStatus?.status === 'cancelled' && evalStatus?.auctionId === auctionId && (
        <div className="scrape-banner">
          Evaluation cancelled — {evalStatus.lotsProcessed} lots processed, {evalStatus.flaggedCount} flagged
        </div>
      )}

      {evalStatus?.status === 'error' && evalStatus?.auctionId === auctionId && evalStatus.errors?.length > 0 && (
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
