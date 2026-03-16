import { useState, useEffect, useRef } from 'react';
import { expandInterest } from '../services/api';

function InterestForm({ interest, onSave, onCancel }) {
  const [form, setForm] = useState({
    name: '',
    priority: 'medium',
    directMatches: '',
    semanticMatches: '',
    watchFor: '',
    avoid: '',
    notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [expanding, setExpanding] = useState(false);
  const [expandSeconds, setExpandSeconds] = useState(0);
  const [expandError, setExpandError] = useState(null);
  const expandTimerRef = useRef(null);

  useEffect(() => {
    if (interest) {
      setForm({
        name: interest.name || '',
        priority: interest.priority || 'medium',
        directMatches: (interest.directMatches || []).join(', '),
        semanticMatches: (interest.semanticMatches || []).join(', '),
        watchFor: (interest.watchFor || []).join(', '),
        avoid: (interest.avoid || []).join(', '),
        notes: interest.notes || '',
      });
    }
  }, [interest]);

  useEffect(() => {
    return () => { if (expandTimerRef.current) clearInterval(expandTimerRef.current); };
  }, []);

  const parseList = (str) =>
    str.split(',').map((s) => s.trim()).filter(Boolean);

  const handleExpand = async () => {
    if (!form.name.trim()) return;
    setExpanding(true);
    setExpandError(null);
    setExpandSeconds(0);
    expandTimerRef.current = setInterval(() => setExpandSeconds((s) => s + 1), 1000);
    try {
      const profile = await expandInterest(form.name.trim(), form.notes.trim());
      setForm((prev) => ({
        ...prev,
        directMatches: profile.directMatches.join(', '),
        semanticMatches: profile.semanticMatches.join(', '),
        watchFor: profile.watchFor.join(', '),
        avoid: profile.avoid.join(', '),
        notes: profile.notes,
      }));
    } catch (err) {
      setExpandError(err.response?.data?.error || err.message);
    } finally {
      setExpanding(false);
      clearInterval(expandTimerRef.current);
      expandTimerRef.current = null;
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave({
        name: form.name,
        priority: form.priority,
        directMatches: parseList(form.directMatches),
        semanticMatches: parseList(form.semanticMatches),
        watchFor: parseList(form.watchFor),
        avoid: parseList(form.avoid),
        notes: form.notes,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="interest-form-overlay" onClick={onCancel}>
      <form className="interest-form" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
        <h2>{interest ? 'Edit Interest' : 'New Interest'}</h2>

        <label>
          Name
          <input
            type="text"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
            disabled={!!interest}
          />
        </label>

        <label>
          Priority
          <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </label>

        <label>
          Notes <span className="field-hint">brief hint for AI, or full collector notes</span>
          <textarea
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            rows={6}
            required
            placeholder={interest ? '' : 'e.g. "vintage strategy and family games from the 70s-90s"'}
          />
        </label>

        <div className="expand-section">
          <button
            type="button"
            className="btn btn-expand"
            onClick={handleExpand}
            disabled={expanding || !form.name.trim()}
          >
            {expanding ? `Expanding... ${expandSeconds}s` : 'AI Expand'}
          </button>
          <span className="field-hint">{expanding ? 'Waiting for LLM response' : 'Generate matches from name + notes above'}</span>
          {expandError && <div className="expand-error">{expandError}</div>}
        </div>

        <label>
          Direct Matches <span className="field-hint">comma-separated keywords</span>
          <input
            type="text"
            value={form.directMatches}
            onChange={(e) => setForm({ ...form, directMatches: e.target.value })}
          />
        </label>

        <label>
          Semantic Matches <span className="field-hint">concepts for AI to evaluate</span>
          <input
            type="text"
            value={form.semanticMatches}
            onChange={(e) => setForm({ ...form, semanticMatches: e.target.value })}
          />
        </label>

        <label>
          Watch For <span className="field-hint">confidence boosters</span>
          <input
            type="text"
            value={form.watchFor}
            onChange={(e) => setForm({ ...form, watchFor: e.target.value })}
          />
        </label>

        <label>
          Avoid <span className="field-hint">red flags</span>
          <input
            type="text"
            value={form.avoid}
            onChange={(e) => setForm({ ...form, avoid: e.target.value })}
          />
        </label>

        <div className="form-actions">
          <button type="submit" className="btn btn-save" disabled={saving}>
            {saving ? 'Saving...' : 'Save'}
          </button>
          <button type="button" className="btn btn-cancel" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

export default InterestForm;
