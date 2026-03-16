import { useState, useEffect } from 'react';
import { getWeeks } from '../services/api';

function WeekSelector({ selected, onChange, refreshKey }) {
  const [weeks, setWeeks] = useState([]);

  useEffect(() => {
    getWeeks().then((w) => {
      setWeeks(w);
      // Auto-select most recent if nothing selected or after refresh
      if ((!selected || refreshKey) && w.length > 0) {
        onChange(w[0]);
      }
    });
  }, [refreshKey]);

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
        {weeks.length === 0 && <option value="">Loading...</option>}
        {weeks.map((w) => (
          <option key={w} value={w}>{formatWeek(w)}</option>
        ))}
      </select>
    </div>
  );
}

export default WeekSelector;
