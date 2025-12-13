import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { api } from '../services/api';
import { wsService } from '../services/websocket';
import type { AuthState } from '../types';

interface AuthContextType extends AuthState {
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

const STORAGE_KEY = 'voiceauth_session';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    token: null,
    isAuthenticated: false,
  });

  // Load session from storage on mount
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const { user, token } = JSON.parse(saved);
        setState({ user, token, isAuthenticated: true });
        api.setToken(token);
        wsService.connect(token);  // This might be called twice
      } catch {
        localStorage.removeItem(STORAGE_KEY);
      }
    }
  }, []);

  const login = async (username: string, password: string) => {
    const { user, token } = await api.login(username, password);
    setState({ user, token, isAuthenticated: true });
    api.setToken(token);
    wsService.connect(token);
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ user, token }));
  };

  const register = async (username: string, password: string) => {
    const { user, token } = await api.register(username, password);
    setState({ user, token, isAuthenticated: true });
    api.setToken(token);
    wsService.connect(token);
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ user, token }));
  };

  const logout = () => {
    setState({ user: null, token: null, isAuthenticated: false });
    api.setToken(null);
    wsService.disconnect();
    localStorage.removeItem(STORAGE_KEY);
  };

  return (
    <AuthContext.Provider value={{ ...state, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
