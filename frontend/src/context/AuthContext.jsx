import { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import authService from '../services/authService.js';
import { tokenStore } from '../services/api.js';

const AuthContext = createContext(null);

export const HOME_BY_ROLE = {
  admin: '/admin/dashboard',
  faculty: '/faculty/dashboard',
  student: '/student/dashboard',
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  // `loading` covers the initial session restore so protected routes do not
  // redirect to /login before we know whether the stored token is valid.
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function restore() {
      if (!tokenStore.get()) {
        setLoading(false);
        return;
      }
      try {
        const me = await authService.me();
        if (!cancelled) setUser(me);
      } catch {
        tokenStore.clear();
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    restore();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email, password, portal = 'public') => {
    const me = await authService.login(email, password, portal);
    setUser(me);
    return me;
  }, []);

  const register = useCallback(async (payload) => {
    const me = await authService.register(payload);
    setUser(me);
    return me;
  }, []);

  const registerAdmin = useCallback(async (payload) => {
    const me = await authService.registerAdmin(payload);
    setUser(me);
    return me;
  }, []);

  const logout = useCallback(async () => {
    await authService.logout();
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({
      user,
      loading,
      login,
      register,
      registerAdmin,
      logout,
      setUser,
      isAuthenticated: Boolean(user),
      role: user?.role ?? null,
      // No session: home is the landing page, not the sign-in form.
      homePath: user ? HOME_BY_ROLE[user.role] : '/',
    }),
    [user, loading, login, register, registerAdmin, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside an AuthProvider.');
  return context;
}

export default AuthContext;
