import { useState } from 'react';
import { toggleInterest, deleteInterest } from '../services/api';

function InterestCard({ interest, onUpdate, onDelete, onEdit }) {
  const [expanded, setExpanded] = useState(false);
  const [toggling, setToggling] = useState(false);

  const handleToggle = async () => {
    setToggling(true);
    try {
      const updated = await toggleInterest(interest._id);
      onUpdate(updated);
    } catch (err) {
      console.error('Toggle failed:', err);
    } finally {
      setToggling(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Delete "${interest.name}"?`)) return;
    try {
      await deleteInterest(interest._id);
      onDelete(interest._id);
    } catch (err) {
      console.error('Delete failed:', err);
    }
  };

  const TagList = ({ label, items, className }) => {
    if (!items || items.length === 0) return null;
    return (
      <div className="interest-tag-group">
        <span className="interest-tag-label">{label}:</span>
        <div className="interest-tags">
          {items.map((item, i) => (
            <span key={i} className={`interest-tag ${className || ''}`}>{item}</span>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className={`interest-card ${interest.active ? '' : 'interest-inactive'}`}>
      <div className="interest-card-header" onClick={() => setExpanded(!expanded)}>
        <div className="interest-card-title">
          <span className={`priority-badge priority-${interest.priority}`}>{interest.priority}</span>
          <h3>{interest.name}</h3>
          {!interest.active && <span className="inactive-badge">inactive</span>}
        </div>
        <div className="interest-card-counts">
          <span>{interest.directMatches?.length || 0} direct</span>
          <span>{interest.semanticMatches?.length || 0} semantic</span>
          <span>{interest.watchFor?.length || 0} boosters</span>
          <span>{interest.avoid?.length || 0} red flags</span>
        </div>
        <span className="expand-arrow">{expanded ? '\u25B2' : '\u25BC'}</span>
      </div>

      {expanded && (
        <div className="interest-card-body">
          {interest.notes && (
            <div className="interest-notes">{interest.notes}</div>
          )}
          <TagList label="Direct Matches" items={interest.directMatches} className="tag-direct" />
          <TagList label="Semantic Matches" items={interest.semanticMatches} className="tag-semantic" />
          <TagList label="Watch For" items={interest.watchFor} className="tag-boost" />
          <TagList label="Avoid" items={interest.avoid} className="tag-avoid" />

          <div className="interest-card-actions">
            <button className="btn btn-edit" onClick={() => onEdit(interest)}>Edit</button>
            <button
              className="btn btn-toggle"
              onClick={handleToggle}
              disabled={toggling}
            >
              {interest.active ? 'Disable' : 'Enable'}
            </button>
            <button className="btn btn-delete" onClick={handleDelete}>Delete</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default InterestCard;
