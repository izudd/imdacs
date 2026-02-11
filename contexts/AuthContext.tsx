
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { User } from '../types';
import * as api from '../services/apiService';

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  error: string | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const useAuth = (): AuthContextType => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Check session on mount
  useEffect(() => {
    api.checkSession()
      .then((res) => {
        if (res.authenticated && res.user) {
          setUser(res.user);
        }
      })
      .catch(() => {
        // Not authenticated, that's fine
      })
      .finally(() => setIsLoading(false));
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    setError(null);
    setIsLoading(true);
    try {
      const loggedInUser = await api.login(username, password);
      setUser(loggedInUser);
    } catch (err: any) {
      setError(err.message || 'Login failed');
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } catch {
      // Logout even if API fails
    }
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, isLoading, error, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};
