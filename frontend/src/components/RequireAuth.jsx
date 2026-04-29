import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function RequireAuth({ children }) {
  const { authed } = useAuth();
  const location = useLocation();

  if (authed === null) {
    return <div className="auth-loading">Loading…</div>;
  }
  if (!authed) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }
  return children;
}
