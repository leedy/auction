import { useState, useEffect, useContext } from 'react';
import { getAuctionHouses, getAvailableAuctions, importAuction, archiveClosedAuctions, unarchiveAllAuctions } from '../services/api';
import { AuctionHouseContext } from '../App';

function Auctions() {
  const { refreshHouses } = useContext(AuctionHouseContext);
  const [houses, setHouses] = useState([]);
  const [available, setAvailable] = useState({}); // { slug: { auctions, loading, error } }
  const [importing, setImporting] = useState({}); // { auctionId: true }
  const [archiving, setArchiving] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [archiveResult, setArchiveResult] = useState(null);

  useEffect(() => {
    getAuctionHouses().then(setHouses).catch(() => {});
  }, []);

  const handleCheckAuctions = async (house) => {
    setAvailable((prev) => ({ ...prev, [house.slug]: { auctions: [], loading: true, error: null } }));
    try {
      const data = await getAvailableAuctions(house.slug);
      setAvailable((prev) => ({ ...prev, [house.slug]: { auctions: data.auctions || [], loading: false, error: null } }));
    } catch (err) {
      setAvailable((prev) => ({ ...prev, [house.slug]: { auctions: [], loading: false, error: err.response?.data?.error || err.message } }));
    }
  };

  const handleImport = async (auctionId, slug) => {
    setImporting((prev) => ({ ...prev, [auctionId]: true }));
    try {
      await importAuction(auctionId, slug);
      // Refresh the available list to show updated import status
      await handleCheckAuctions({ slug, subdomain: '' });
    } catch (err) {
      console.error('Import failed:', err);
    } finally {
      setImporting((prev) => ({ ...prev, [auctionId]: false }));
    }
  };

  const handleRestoreAll = async () => {
    setRestoring(true);
    setArchiveResult(null);
    try {
      const result = await unarchiveAllAuctions();
      setArchiveResult({ type: 'restore', count: result.restored });
    } catch (err) {
      console.error('Restore failed:', err);
    } finally {
      setRestoring(false);
    }
  };

  const handleArchiveClosed = async () => {
    setArchiving(true);
    setArchiveResult(null);
    try {
      const result = await archiveClosedAuctions();
      setArchiveResult({ type: 'archive', count: result.archived });
    } catch (err) {
      console.error('Archive failed:', err);
    } finally {
      setArchiving(false);
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/New_York' });
  };

  return (
    <div className="page">
      <div className="page-header">
        <h1>Auctions</h1>
        <button
          className="btn btn-archive-closed"
          onClick={handleRestoreAll}
          disabled={restoring || archiving}
          title="Restore all archived auctions back to active"
        >
          {restoring ? 'Restoring...' : 'Restore All'}
        </button>
        <button
          className="btn btn-archive-closed"
          onClick={handleArchiveClosed}
          disabled={archiving || restoring}
          title="Hide auctions closed 5+ days ago (data is kept)"
        >
          {archiving ? 'Archiving...' : 'Archive Closed'}
        </button>
      </div>
      {archiveResult !== null && (
        <div className="scrape-banner">
          {archiveResult.type === 'restore'
            ? archiveResult.count === 0
              ? 'Nothing to restore.'
              : `Restored ${archiveResult.count} auction${archiveResult.count !== 1 ? 's' : ''}.`
            : archiveResult.count === 0
            ? 'No auctions closed 5+ days ago.'
            : `Archived ${archiveResult.count} auction${archiveResult.count !== 1 ? 's' : ''} (closed 5+ days ago).`}
        </div>
      )}

      {houses.length === 0 && (
        <div className="empty-state">No auction houses configured. Add one in Admin.</div>
      )}

      {houses.filter((h) => h.active).map((house) => {
        const state = available[house.slug] || {};
        return (
          <div key={house.slug} className="auction-house-section">
            <div className="auction-house-header">
              <h2>{house.name}</h2>
              <span className="auction-house-detail">{house.subdomain}</span>
              <button
                className="btn btn-check-auctions"
                onClick={() => handleCheckAuctions(house)}
                disabled={state.loading}
              >
                {state.loading ? 'Checking...' : 'Check for Auctions'}
              </button>
            </div>

            {state.error && <div className="error-banner">{state.error}</div>}

            {state.auctions?.length > 0 && (
              <div className="auction-list">
                {state.auctions.map((auction) => (
                  <div key={auction.auctionId} className={`auction-card ${!auction.isOnline ? 'auction-webcast' : ''}`}>
                    <div className="auction-card-info">
                      <div className="auction-card-name">{auction.name || `Auction ${auction.auctionId}`}</div>
                      <div className="auction-card-meta">
                        {auction.lotCount} lots &middot; Closes {formatDate(auction.bidCloseDateTime)}
                        {!auction.isOnline && <span className="auction-badge-webcast">Webcast</span>}
                        {auction.imported && <span className="auction-badge-imported">Imported</span>}
                      </div>
                    </div>
                    <div className="auction-card-actions">
                      {auction.isOnline ? (
                        <button
                          className="btn btn-import"
                          onClick={() => handleImport(auction.auctionId, house.slug)}
                          disabled={importing[auction.auctionId]}
                        >
                          {importing[auction.auctionId] ? 'Importing...' : auction.imported ? 'Re-import' : 'Import'}
                        </button>
                      ) : (
                        <span className="auction-not-importable">Not importable</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {state.auctions?.length === 0 && !state.loading && !state.error && (
              <div className="auction-empty">No open auctions found.</div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default Auctions;
