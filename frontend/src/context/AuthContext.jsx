import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { authLogin, authLogout, authMe, authChangePassword, setOnUnauthorized } from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  // null = unknown (still checking), true = logged in, false = not logged in
  const [authed, setAuthed] = useState(null);
  const [email, setEmail] = useState(null);
  const [role, setRole] = useState(null);

  const refresh = useCallback(async () => {
    try {
      const data = await authMe();
      setAuthed(!!data?.authenticated);
      setEmail(data?.email || null);
      setRole(data?.role || null);
    } catch {
      setAuthed(false);
      setEmail(null);
      setRole(null);
    }
  }, []);

  useEffect(() => {
    refresh();
    setOnUnauthorized(() => {
      setAuthed(false);
      setEmail(null);
      setRole(null);
    });
  }, [refresh]);

  const login = useCallback(async (emailInput, password) => {
    await authLogin(emailInput, password);
    await refresh();
  }, [refresh]);

  const logout = useCallback(async () => {
    try { await authLogout(); } catch { /* clear locally either way */ }
    setAuthed(false);
    setEmail(null);
    setRole(null);
  }, []);

  const changePassword = useCallback(async (currentPassword, newPassword) => {
    await authChangePassword(currentPassword, newPassword);
  }, []);

  return (
    <AuthContext.Provider value={{ authed, email, role, login, logout, changePassword, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
