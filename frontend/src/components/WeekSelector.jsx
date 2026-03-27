import { useState, useEffect } from 'react';
import { getWeeks } from '../services/api';

function WeekSelector({ selected, onChange, refreshKey, ah }) {
  const [weeks, setWeeks] = useState([]);

  useEffect(() => {
    if (!ah) return;
    getWeeks(ah).then((w) => {
      setWeeks(w);
      // Auto-select most recent if nothing selected, after refresh, or after house change
      if (w.length > 0 && (!selected || !w.includes(selected))) {
        onChange(w[0]);
      } else if (w.length === 0) {
        onChange(null);
      }
    });
  }, [ah, refreshKey]);

  const formatWeek = (w) => {
    const d = new Date(w + 'T12:00:00');
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <div className="week-selector">
      <label htmlFor="week-select">Week of:</label>
      <select
        id="week-select"
        value={selected || ''}
        onChange={(e) => onChange(e.target.value)}
      >
        {weeks.length === 0 && <option value="">No data</option>}
        {weeks.map((w) => (
          <option key={w} value={w}>{formatWeek(w)}</option>
        ))}
      </select>
    </div>
  );
}

export default WeekSelector;
