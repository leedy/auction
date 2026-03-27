import { useState, useEffect, useMemo, useContext } from 'react';
import AuctionSelector from '../components/AuctionSelector';
import LotGrid from '../components/LotGrid';
import LotDetail from '../components/LotDetail';
import { getLotsByAuctionId, getEvaluationsByAuction, getPicksByAuction, togglePick, updatePricesByAuction } from '../services/api';
import { AuctionHouseContext } from '../App';

function Lots() {
  const { ah } = useContext(AuctionHouseContext);
  const [auctionId, setAuctionId] = useState(null);
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

  // Reset when auction house changes
  useEffect(() => {
    setAuctionId(null);
    setLots([]);
    setEvaluations([]);
    setPriceResult(null);
    setAuctionRefreshKey((k) => k + 1);
  }, [ah]);

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

  useEffect(() => {
    if (!auctionId) return;
    setLoading(true);
    setError(null);
    Promise.all([
      getLotsByAuctionId(auctionId),
      getEvaluationsByAuction(auctionId),
      getPicksByAuction(auctionId),
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
    return [...result].sort(
      (a, b) => (parseInt(a.lotNumber, 10) || 0) - (parseInt(b.lotNumber, 10) || 0)
    );
  }, [lots, search, showPicksOnly, pickedSet]);

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
          className="btn btn-update-prices"
          onClick={handleUpdatePrices}
          disabled={updatingPrices || !auctionId}
        >
          {updatingPrices ? 'Updating...' : 'Update Prices'}
        </button>
        <div className="lot-count">
          {loading ? 'Loading...' : `${filtered.length} of ${lots.length} lots`}
        </div>
      </div>

      {priceResult && (
        <div className="scrape-banner">
          {priceResult.withPrices > 0
            ? `Updated ${priceResult.updated} lots with final prices (${priceResult.withPrices} sold)`
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
