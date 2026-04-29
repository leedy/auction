import { useState } from 'react';
import { useAuth } from '../context/AuthContext';

export default function Account() {
  const { email, role, changePassword } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    if (newPassword !== confirmPassword) {
      setError('New passwords do not match.');
      return;
    }
    setSubmitting(true);
    try {
      await changePassword(currentPassword, newPassword);
      setSuccess('Password updated.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      const status = err?.response?.status;
      const msg = err?.response?.data?.error;
      if (status === 429) setError('Too many attempts. Try again in a few minutes.');
      else if (msg) setError(msg);
      else setError('Failed to change password.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="account-page">
      <div className="page-header"><h1>Account</h1></div>

      <div className="admin-section">
        <h2>Profile</h2>
        <div className="account-field"><span className="account-label">Email</span><span>{email || '—'}</span></div>
        <div className="account-field"><span className="account-label">Role</span><span>{role || '—'}</span></div>
      </div>

      <div className="admin-section">
        <h2>Change password</h2>
        <form className="account-form" onSubmit={handleSubmit}>
          <label htmlFor="current">Current password</label>
          <input
            id="current"
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            disabled={submitting}
            required
          />
          <label htmlFor="new">New password</label>
          <input
            id="new"
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            disabled={submitting}
            required
          />
          <label htmlFor="confirm">Confirm new password</label>
          <input
            id="confirm"
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            disabled={submitting}
            required
          />
          <div className="account-actions">
            <button type="submit" className="btn btn-save" disabled={submitting || !currentPassword || !newPassword}>
              {submitting ? 'Saving…' : 'Update password'}
            </button>
          </div>
          {error && <div className="error-banner">{error}</div>}
          {success && <div className="success-banner">{success}</div>}
        </form>
      </div>
    </div>
  );
}
