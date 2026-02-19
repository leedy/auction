import LotCard from './LotCard';

function LotGrid({ lots, evaluations, onSelectLot, pickedSet, onTogglePick }) {
  // Build a lookup map for evaluations by lotId
  const evalMap = {};
  if (evaluations) {
    for (const e of evaluations) {
      evalMap[e.lotId] = e;
    }
  }

  if (lots.length === 0) {
    return <div className="empty-state">No lots found.</div>;
  }

  return (
    <div className="lot-grid">
      {lots.map((lot) => (
        <LotCard
          key={lot.lotId}
          lot={lot}
          evaluation={evalMap[lot.lotId]}
          onSelect={onSelectLot}
          isPicked={pickedSet?.has(lot.lotId)}
          onTogglePick={onTogglePick}
        />
      ))}
    </div>
  );
}

export default LotGrid;
