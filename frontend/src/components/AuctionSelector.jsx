import { useState, useEffect } from 'react';
import { getImportedAuctions } from '../services/api';

function AuctionSelector({ selected, onChange, refreshKey, ah }) {
  const [auctions, setAuctions] = useState([]);

  useEffect(() => {
    if (!ah) return;
    getImportedAuctions(ah).then((data) => {
      setAuctions(data);
      // Auto-select most recent if none selected or selection not in list
      if (data.length > 0) {
        const ids = data.map((a) => a.auctionId);
        if (!selected || !ids.includes(selected)) {
          onChange(data[0].auctionId);
        }
      } else {
        onChange(null);
      }
    });
  }, [ah, refreshKey]);

  const formatAuction = (a) => {
    const close = new Date(a.bidCloseDateTime);
    const date = close.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const name = a.name || 'Unnamed Auction';
    const house = a.houseName || '';
    return `${date} — ${name}${house ? ` (${house})` : ''}`;
  };

  return (
    <div className="auction-selector">
      <label htmlFor="auction-select">Auction:</label>
      <select
        id="auction-select"
        value={selected || ''}
        onChange={(e) => onChange(Number(e.target.value))}
      >
        {auctions.length === 0 && <option value="">No auctions imported</option>}
        {auctions.map((a) => (
          <option key={a.auctionId} value={a.auctionId}>
            {formatAuction(a)}
          </option>
        ))}
      </select>
    </div>
  );
}

export default AuctionSelector;
