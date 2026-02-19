function LotCard({ lot, evaluation, onSelect, isPicked, onTogglePick }) {
  const hasBids = lot.bidCount > 0;

  const handleStar = (e) => {
    e.stopPropagation();
    if (onTogglePick) onTogglePick(lot.lotId, lot.auctionId);
  };

  return (
    <div className="lot-card" onClick={() => onSelect(lot.lotId)}>
      {lot.image ? (
        <img src={lot.image} alt={lot.title} className="lot-card-img" loading="lazy" />
      ) : (
        <div className="lot-card-img lot-card-no-img">No Image</div>
      )}
      <div className="lot-card-body">
        <div className="lot-card-lot-number">Lot #{lot.lotNumber}</div>
        <div className="lot-card-title">{lot.title}</div>
        <div className="lot-card-bids">
          {hasBids ? (
            <>
              <span className="lot-card-price">${lot.highBid}</span>
              <span className="lot-card-count">{lot.bidCount} bid{lot.bidCount !== 1 ? 's' : ''}</span>
            </>
          ) : (
            <span className="lot-card-min">Min: ${lot.minBid}</span>
          )}
        </div>
        {lot.timeLeft && (
          <div className="lot-card-time">{lot.timeLeft.trim()}</div>
        )}
      </div>
      <button
        className={`lot-card-star ${isPicked ? 'star-active' : ''}`}
        onClick={handleStar}
        title={isPicked ? 'Remove from picks' : 'Add to picks'}
      >
        {isPicked ? '\u2605' : '\u2606'}
      </button>
      {evaluation?.interested && (
        <div className={`lot-card-badge badge-${evaluation.confidence}`}>
          {evaluation.category?.split(' ')[0]}
        </div>
      )}
    </div>
  );
}

export default LotCard;
