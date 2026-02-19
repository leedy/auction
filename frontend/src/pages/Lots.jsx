import { useState, useEffect, useMemo } from 'react';
import WeekSelector from '../components/WeekSelector';
import LotGrid from '../components/LotGrid';
import LotDetail from '../components/LotDetail';
import { getLots, getEvaluations, getPicks, togglePick } from '../services/api';

function Lots() {
  const [weekOf, setWeekOf] = useState(null);
  const [lots, setLots] = useState([]);
  const [evaluations, setEvaluations] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedLotId, setSelectedLotId] = useState(null);
  const [pickedSet, setPickedSet] = useState(new Set());
  const [showPicksOnly, setShowPicksOnly] = useState(false);

  useEffect(() => {
    if (!weekOf) return;
    setLoading(true);
    Promise.all([getLots(weekOf), getEvaluations(weekOf), getPicks(weekOf)])
      .then(([lotsData, evalsData, picksData]) => {
        setLots(lotsData);
        setEvaluations(evalsData);
        setPickedSet(new Set(picksData.map((p) => p.lotId)));
      })
      .catch((err) => console.error('Failed to load lots:', err))
      .finally(() => setLoading(false));
  }, [weekOf]);

  const handleTogglePick = async (lotId, auctionId) => {
    try {
      const result = await togglePick(lotId, auctionId, weekOf);
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
        <WeekSelector selected={weekOf} onChange={setWeekOf} />
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
        <div className="lot-count">
          {loading ? 'Loading...' : `${filtered.length} of ${lots.length} lots`}
        </div>
      </div>

      {!loading && (
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
