import { useState, useEffect } from 'react';
import WeekSelector from '../components/WeekSelector';
import FlaggedCard from '../components/FlaggedCard';
import LotDetail from '../components/LotDetail';
import { getFlagged, getSummary } from '../services/api';

function Flagged() {
  const [weekOf, setWeekOf] = useState(null);
  const [flagged, setFlagged] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [selectedLotId, setSelectedLotId] = useState(null);

  useEffect(() => {
    if (!weekOf) return;
    setLoading(true);
    Promise.all([getFlagged(weekOf), getSummary(weekOf)])
      .then(([flaggedData, summaryData]) => {
        setFlagged(flaggedData);
        setSummary(summaryData);
      })
      .catch((err) => console.error('Failed to load flagged:', err))
      .finally(() => setLoading(false));
  }, [weekOf]);

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
        <WeekSelector selected={weekOf} onChange={setWeekOf} />
      </div>

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

      {loading && <div className="loading">Loading...</div>}

      {!loading && flagged.length === 0 && weekOf && (
        <div className="empty-state">No flagged items for this week.</div>
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
                key={item.lotId}
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
