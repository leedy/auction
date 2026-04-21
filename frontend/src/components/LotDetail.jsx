import { useState, useEffect, useCallback } from 'react';
import { getLot } from '../services/api';

function LotDetail({ lotId, onClose, isPicked, onTogglePick }) {
  const [lot, setLot] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activePhoto, setActivePhoto] = useState(0);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await getLot(lotId);
        setLot(data);
      } catch (err) {
        setError(err.message || 'Failed to load lot details');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [lotId]);

  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === 'Escape') onClose();
      if (!lot?.pictures?.length) return;
      if (e.key === 'ArrowLeft') {
        setActivePhoto((p) => (p > 0 ? p - 1 : lot.pictures.length - 1));
      }
      if (e.key === 'ArrowRight') {
        setActivePhoto((p) => (p < lot.pictures.length - 1 ? p + 1 : 0));
      }
    },
    [lot, onClose]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const pictures = lot?.pictures || [];
  const hasPictures = pictures.length > 0;
  const currentPic = hasPictures ? pictures[activePhoto] : null;

  const prevPhoto = () => {
    setActivePhoto((p) => (p > 0 ? p - 1 : pictures.length - 1));
  };

  const nextPhoto = () => {
    setActivePhoto((p) => (p < pictures.length - 1 ? p + 1 : 0));
  };

  const handlePick = () => {
    if (lot && onTogglePick) onTogglePick(lot.lotId, lot.auctionId);
  };

  return (
    <div className="lot-detail-overlay" onClick={onClose}>
      <div className="lot-detail-modal" onClick={(e) => e.stopPropagation()}>
        <button className="lot-detail-close" onClick={onClose}>
          &times;
        </button>

        {loading && <div className="loading">Loading lot details...</div>}
        {error && <div className="lot-detail-error">{error}</div>}

        {lot && !loading && (
          <>
            {/* Photo Gallery */}
            <div className="lot-gallery">
              {hasPictures ? (
                <>
                  <div className="lot-gallery-main">
                    {pictures.length > 1 && (
                      <button className="gallery-nav gallery-prev" onClick={prevPhoto}>
                        &#8249;
                      </button>
                    )}
                    <img
                      src={currentPic.fullSizeLocation}
                      alt={currentPic.description || lot.title}
                      className="lot-gallery-img"
                    />
                    {pictures.length > 1 && (
                      <button className="gallery-nav gallery-next" onClick={nextPhoto}>
                        &#8250;
                      </button>
                    )}
                  </div>
                  {pictures.length > 1 && (
                    <div className="lot-gallery-counter">
                      {activePhoto + 1} / {pictures.length}
                    </div>
                  )}
                  {pictures.length > 1 && (
                    <div className="lot-gallery-thumbs">
                      {pictures.map((pic, i) => (
                        <img
                          key={i}
                          src={pic.thumbnailLocation}
                          alt={pic.description || `Photo ${i + 1}`}
                          className={`lot-gallery-thumb ${i === activePhoto ? 'thumb-active' : ''}`}
                          onClick={() => setActivePhoto(i)}
                        />
                      ))}
                    </div>
                  )}
                </>
              ) : (lot.imageFull || lot.image) ? (
                <div className="lot-gallery-main">
                  <img src={lot.imageFull || lot.image} alt={lot.title} className="lot-gallery-img" />
                </div>
              ) : (
                <div className="lot-gallery-main lot-gallery-empty">No Photos Available</div>
              )}
            </div>

            {/* Lot Info */}
            <div className="lot-detail-info">
              <div className="lot-detail-lot-number">Lot #{lot.lotNumber}</div>
              <h2 className="lot-detail-title">{lot.title}</h2>

              <div className="lot-detail-bids">
                {lot.priceRealized > 0 ? (
                  <>
                    <span className="lot-detail-price lot-detail-sold">Sold: ${lot.priceRealized.toFixed(2)}</span>
                    {lot.bidCount > 0 && (
                      <span className="lot-detail-count">
                        {lot.bidCount} bid{lot.bidCount !== 1 ? 's' : ''}
                      </span>
                    )}
                  </>
                ) : lot.bidCount > 0 ? (
                  <>
                    <span className="lot-detail-price">${lot.highBid}</span>
                    <span className="lot-detail-count">
                      {lot.bidCount} bid{lot.bidCount !== 1 ? 's' : ''}
                    </span>
                  </>
                ) : (
                  <span className="lot-detail-min">Min Bid: ${lot.minBid}</span>
                )}
                {!lot.priceRealized && lot.timeLeft && (
                  <span className="lot-detail-time">{lot.timeLeft.trim()}</span>
                )}
              </div>

              {lot.description && (
                <div className="lot-detail-description">{lot.description}</div>
              )}

              <div className="lot-detail-actions">
                <button
                  className={`btn btn-pick ${isPicked ? 'btn-pick-active' : ''}`}
                  onClick={handlePick}
                >
                  {isPicked ? '\u2605 Picked' : '\u2606 Add to My Picks'}
                </button>
                <a
                  href={lot.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-hibid"
                >
                  View on HiBid &rarr;
                </a>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default LotDetail;
