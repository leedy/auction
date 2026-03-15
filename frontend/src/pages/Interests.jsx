import { useState, useEffect } from 'react';
import InterestCard from '../components/InterestCard';
import InterestForm from '../components/InterestForm';
import { getInterests, createInterest, updateInterest } from '../services/api';

function Interests() {
  const [interests, setInterests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);    // interest object or null
  const [showForm, setShowForm] = useState(false);  // for new interest
  const [error, setError] = useState(null);

  useEffect(() => {
    loadInterests();
  }, []);

  const loadInterests = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getInterests();
      setInterests(data);
    } catch (err) {
      console.error('Failed to load interests:', err);
      setError('Failed to load interests. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = (updated) => {
    setInterests((prev) =>
      prev.map((i) => (i._id === updated._id ? updated : i))
    );
  };

  const handleDelete = (id) => {
    setInterests((prev) => prev.filter((i) => i._id !== id));
  };

  const handleSaveNew = async (data) => {
    try {
      const created = await createInterest(data);
      setInterests((prev) => [...prev, created]);
      setShowForm(false);
    } catch (err) {
      console.error('Failed to create interest:', err);
    }
  };

  const handleSaveEdit = async (data) => {
    try {
      const updated = await updateInterest(editing._id, data);
      handleUpdate(updated);
      setEditing(null);
    } catch (err) {
      console.error('Failed to update interest:', err);
    }
  };

  return (
    <div className="page">
      <div className="page-header">
        <h1>Collector Interests</h1>
        <button className="btn btn-add" onClick={() => setShowForm(true)}>
          + New Interest
        </button>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {loading && <div className="loading">Loading...</div>}

      {!loading && interests.length === 0 && (
        <div className="empty-state">No interests defined yet.</div>
      )}

      <div className="interests-list">
        {interests.map((interest) => (
          <InterestCard
            key={interest._id}
            interest={interest}
            onUpdate={handleUpdate}
            onDelete={handleDelete}
            onEdit={(i) => setEditing(i)}
          />
        ))}
      </div>

      {showForm && (
        <InterestForm
          interest={null}
          onSave={handleSaveNew}
          onCancel={() => setShowForm(false)}
        />
      )}

      {editing && (
        <InterestForm
          interest={editing}
          onSave={handleSaveEdit}
          onCancel={() => setEditing(null)}
        />
      )}
    </div>
  );
}

export default Interests;
