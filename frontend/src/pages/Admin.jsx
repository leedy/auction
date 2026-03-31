import { useState, useEffect, useContext } from 'react';
import { getAuctionHouses, createAuctionHouse, updateAuctionHouse, deleteAuctionHouse } from '../services/api';
import { AuctionHouseContext } from '../App';

const DAYS_OF_WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday', 'Any'];

function Admin() {
  const { refreshHouses } = useContext(AuctionHouseContext);
  const [houses, setHouses] = useState([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newHouse, setNewHouse] = useState({ name: '', subdomain: '', auctionDay: 'Thursday' });
  const [houseSaving, setHouseSaving] = useState(false);
  const [houseError, setHouseError] = useState(null);

  const loadHouses = async () => {
    try {
      const data = await getAuctionHouses();
      setHouses(data);
    } catch {
      // ignore
    }
  };

  const handleAddHouse = async () => {
    setHouseSaving(true);
    setHouseError(null);
    try {
      const slug = newHouse.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      let subdomain = newHouse.subdomain.replace(/^https?:\/\//, '').replace(/\/+$/, '');
      if (!subdomain.includes('.')) subdomain = `${subdomain}.hibid.com`;
      await createAuctionHouse({
        slug,
        name: newHouse.name,
        subdomain,
        auctionDay: newHouse.auctionDay,
      });
      setNewHouse({ name: '', subdomain: '', auctionDay: 'Thursday' });
      setShowAddForm(false);
      await loadHouses();
      refreshHouses();
    } catch (err) {
      setHouseError(err.response?.data?.error || 'Failed to add auction house.');
    } finally {
      setHouseSaving(false);
    }
  };

  const handleToggleHouse = async (slug, active) => {
    try {
      await updateAuctionHouse(slug, { active: !active });
      await loadHouses();
      refreshHouses();
    } catch {
      // ignore
    }
  };

  const handleDeleteHouse = async (slug) => {
    try {
      await deleteAuctionHouse(slug);
      await loadHouses();
      refreshHouses();
    } catch (err) {
      setHouseError(err.response?.data?.error || 'Failed to delete auction house.');
    }
  };

  useEffect(() => {
    loadHouses();
  }, []);

  return (
    <div className="page">
      <div className="page-header">
        <h1>Admin</h1>
      </div>

      <div className="admin-section">
        <h2>Auction Houses</h2>
        <p className="admin-section-desc">
          Manage HiBid auction houses to monitor. Each house has its own subdomain and auction schedule.
        </p>

        <div className="ah-list">
          {houses.map((house) => (
            <div key={house.slug} className={`ah-list-item ${house.active ? '' : 'ah-inactive'}`}>
              <div className="ah-list-info">
                <span className="ah-list-name">{house.name}</span>
                <span className="ah-list-detail">{house.subdomain} &middot; {house.auctionDay === 'Any' ? 'Any day' : `${house.auctionDay}s`}</span>
              </div>
              <div className="ah-list-actions">
                <button
                  className="btn btn-sm"
                  onClick={() => handleToggleHouse(house.slug, house.active)}
                >
                  {house.active ? 'Disable' : 'Enable'}
                </button>
                <button
                  className="btn btn-sm btn-danger"
                  onClick={() => handleDeleteHouse(house.slug)}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>

        {houseError && <div className="error-banner">{houseError}</div>}

        {showAddForm ? (
          <div className="ah-add-form">
            <div className="admin-field">
              <label>Name</label>
              <input
                type="text"
                value={newHouse.name}
                onChange={(e) => setNewHouse({ ...newHouse, name: e.target.value })}
                placeholder="e.g. Kleinfelter's"
              />
            </div>
            <div className="admin-field">
              <label>HiBid Subdomain</label>
              <input
                type="text"
                value={newHouse.subdomain}
                onChange={(e) => setNewHouse({ ...newHouse, subdomain: e.target.value })}
                placeholder="e.g. kleinfelters"
              />
              <span className="field-hint">Just the subdomain name, or full domain (e.g. kleinfelters.hibid.com)</span>
            </div>
            <div className="admin-field">
              <label>Auction Day</label>
              <select
                value={newHouse.auctionDay}
                onChange={(e) => setNewHouse({ ...newHouse, auctionDay: e.target.value })}
              >
                {DAYS_OF_WEEK.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
            <div className="admin-actions">
              <button
                className="btn btn-save"
                onClick={handleAddHouse}
                disabled={houseSaving || !newHouse.name || !newHouse.subdomain}
              >
                {houseSaving ? 'Adding...' : 'Add Auction House'}
              </button>
              <button className="btn btn-cancel" onClick={() => setShowAddForm(false)}>Cancel</button>
            </div>
          </div>
        ) : (
          <button className="btn btn-add-house" onClick={() => setShowAddForm(true)}>
            + Add Auction House
          </button>
        )}
      </div>
    </div>
  );
}

export default Admin;
