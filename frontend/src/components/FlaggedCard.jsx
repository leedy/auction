import { useState } from 'react';
import { setFeedback } from '../services/api';

function FlaggedCard({ evaluation, onFeedbackSaved, onSelectLot }) {
  const [saving, setSaving] = useState(false);

  const handleFeedback = async (feedback) => {
    setSaving(true);
    try {
      await setFeedback(evaluation.lotId, evaluation.auctionId, feedback, evaluation.model);
      if (onFeedbackSaved) onFeedbackSaved(evaluation.lotId, feedback);
    } catch (err) {
      console.error('Failed to save feedback:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleImageClick = (e) => {
    e.stopPropagation();
    if (onSelectLot) onSelectLot(evaluation.lotId);
  };

  return (
    <div className={`flagged-card flagged-card--${evaluation.confidence}`}>
      <div className="flagged-card-left" onClick={handleImageClick} style={{ cursor: 'pointer' }}>
        {evaluation.image ? (
          <img src={evaluation.image} alt={evaluation.title} className="flagged-card-img" loading="lazy" />
        ) : (
          <div className="flagged-card-img flagged-card-no-img">No Image</div>
        )}
        <div className="flagged-card-view-photos">View Photos</div>
      </div>
      <div className="flagged-card-body">
        <div className="flagged-card-header">
          <span
            className="flagged-card-title flagged-card-title-link"
            onClick={() => onSelectLot && onSelectLot(evaluation.lotId)}
          >
            {evaluation.title}
          </span>
          <span className={`confidence-badge badge-${evaluation.confidence}`}>
            {evaluation.confidence}
          </span>
        </div>
        {evaluation.reasoning && (
          <div className="flagged-card-reasoning">{evaluation.reasoning}</div>
        )}
        <div className="flagged-card-meta">
          <span className={`flagged-card-price${evaluation.priceRealized > 0 ? ' flagged-card-sold' : ''}`}>
            {evaluation.priceRealized > 0
              ? `Sold: $${evaluation.priceRealized.toFixed(2)}`
              : `$${evaluation.highBid} (${evaluation.bidCount} bid${evaluation.bidCount !== 1 ? 's' : ''})`}
          </span>
          <span className="flagged-card-match">Match: {evaluation.matchType}</span>
          {evaluation.models && evaluation.models.length > 1 && (
            <span className="flagged-card-models">
              {evaluation.models.length} models
            </span>
          )}
          <a href={evaluation.url} target="_blank" rel="noopener noreferrer" className="flagged-card-hibid-link">
            HiBid &rarr;
          </a>
        </div>
        <div className="flagged-card-actions">
          {evaluation.userFeedback ? (
            <span className="feedback-saved">Feedback: {evaluation.userFeedback.replace('_', ' ')}</span>
          ) : (
            <>
              <button
                className="btn btn-good"
                onClick={() => handleFeedback('good_find')}
                disabled={saving}
              >
                Good Find
              </button>
              <button
                className="btn btn-skip"
                onClick={() => handleFeedback('not_interested')}
                disabled={saving}
              >
                Not Interested
              </button>
              <button
                className="btn btn-neutral"
                onClick={() => handleFeedback('already_knew')}
                disabled={saving}
              >
                Already Knew
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default FlaggedCard;
