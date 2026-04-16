import { useState } from 'react';
import { setFeedback, fetchLotPhotos } from '../services/api';

function FlaggedCard({ evaluation, onFeedbackSaved, onSelectLot, isPicked, onTogglePick }) {
  const [saving, setSaving] = useState(false);
  const [showAllModels, setShowAllModels] = useState(false);
  const [loadingPhotos, setLoadingPhotos] = useState(false);
  const [photoCount, setPhotoCount] = useState(evaluation.pictures?.length || null);

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

  const handleLoadPhotos = async (e) => {
    e.stopPropagation();
    setLoadingPhotos(true);
    try {
      const result = await fetchLotPhotos(evaluation.lotId);
      setPhotoCount(result.count);
    } catch (err) {
      console.error('Failed to load photos:', err);
    } finally {
      setLoadingPhotos(false);
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
        <div className="flagged-card-view-photos">View Detail</div>
      </div>
      <div className="flagged-card-body">
        <div className="flagged-card-header">
          <span
            className="flagged-card-title flagged-card-title-link"
            onClick={() => onSelectLot && onSelectLot(evaluation.lotId)}
          >
            {evaluation.lotNumber && `Lot ${evaluation.lotNumber} — `}{evaluation.title}
          </span>
          <span className={`confidence-badge badge-${evaluation.confidence}`}>
            {evaluation.confidence}
          </span>
        </div>
        {evaluation.description && (
          <div className="flagged-card-description">{evaluation.description}</div>
        )}
        {evaluation.reasoning && (
          <div className="flagged-card-reasoning">{evaluation.reasoning}</div>
        )}
        {evaluation.allEvaluations?.length > 1 && (
          <>
            <button
              className="btn-compare-models"
              onClick={() => setShowAllModels((v) => !v)}
            >
              {showAllModels ? 'Hide' : 'Compare'} models ({evaluation.allEvaluations.length})
            </button>
            {showAllModels && (
              <div className="flagged-card-all-models">
                {evaluation.allEvaluations.map((e, i) => (
                  <div key={i} className="flagged-card-model-entry">
                    <div className="flagged-card-model-header">
                      <span className="flagged-card-model-name">{e.model?.split('/').pop()}</span>
                      <span className={`confidence-badge badge-${e.confidence}`}>{e.confidence}</span>
                    </div>
                    <div className="flagged-card-model-reasoning">{e.reasoning}</div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
        <div className="flagged-card-meta">
          <span className={`flagged-card-price${evaluation.priceRealized > 0 ? ' flagged-card-sold' : ''}`}>
            {evaluation.priceRealized > 0
              ? `Sold: $${evaluation.priceRealized.toFixed(2)}`
              : `$${evaluation.highBid} (${evaluation.bidCount} bid${evaluation.bidCount !== 1 ? 's' : ''})`}
          </span>
          <span className="flagged-card-match">Match: {evaluation.matchType}</span>
          {evaluation.model && evaluation.model !== 'manual' && (
            <span className="flagged-card-model">{evaluation.model.split('/').pop()}</span>
          )}
          {evaluation.models && evaluation.models.length > 1 && (
            <span className="flagged-card-models">
              {evaluation.models.length} models
            </span>
          )}
          <button
            className={`flagged-card-star ${isPicked ? 'star-active' : ''}`}
            onClick={(e) => { e.stopPropagation(); onTogglePick && onTogglePick(evaluation.lotId); }}
            title={isPicked ? 'Remove from picks' : 'Add to picks'}
          >
            {isPicked ? '\u2605' : '\u2606'} Pick
          </button>
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
          {photoCount === null && (
            <button
              className="btn btn-load-photos"
              onClick={handleLoadPhotos}
              disabled={loadingPhotos}
            >
              {loadingPhotos ? 'Loading...' : 'Load Photos'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default FlaggedCard;
