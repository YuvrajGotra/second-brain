import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { authService } from '../services/authService';
import { onUnauthorized } from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [initializing, setInitializing] = useState(true);

  // Restore the session from the httpOnly cookie on first load.
  useEffect(() => {
    authService
      .me()
      .then(({ user }) => setUser(user))
      .catch(() => setUser(null))
      .finally(() => setInitializing(false));
  }, []);

  // Any 401 from the API (expired/invalid session) logs the user out locally.
  useEffect(() => onUnauthorized(() => setUser(null)), []);

  const login = useCallback(async (credentials) => {
    const { user } = await authService.login(credentials);
    setUser(user);
    return user;
  }, []);

  const register = useCallback(async (details) => {
    const { user } = await authService.register(details);
    setUser(user);
    return user;
  }, []);

  const logout = useCallback(async () => {
    await authService.logout().catch(() => {});
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, setUser, initializing, login, register, logout }),
    [user, initializing, login, register, logout],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
