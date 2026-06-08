/**
 * AuthContext — session state management for WMS-Web.
 *
 * Provides loading / anonymous / authenticated states with login, logout, and
 * refreshMe helpers. On mount it calls GET /auth/me to resolve the initial
 * state (Req 4.7). A 401 from any non-login API call dispatches a
 * `wms.session-expired` CustomEvent (handled in api.ts); AuthContext listens
 * for that event once, clears the user within 1 second, and navigates to
 * /login (Req 4.5, 10.2).
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchApi, ApiError } from '../lib/api';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PublicUser {
  id: number;
  email: string;
  name: string;
  role: 'admin' | 'staff';
  /** Effective feature access for this user, provided by the backend (/me, /login). */
  features?: string[];
}

export type AuthState =
  | { status: 'loading' }
  | { status: 'anonymous' }
  | { status: 'authenticated'; user: PublicUser };

export interface AuthApi {
  state: AuthState;
  login(email: string, password: string): Promise<{ ok: boolean; error?: string }>;
  logout(): Promise<void>;
  refreshMe(): Promise<void>;
  changePassword(
    currentPassword: string,
    newPassword: string,
  ): Promise<{ ok: boolean; error?: string }>;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthApi | null>(null);

// ─── Provider ─────────────────────────────────────────────────────────────────

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [state, setState] = useState<AuthState>({ status: 'loading' });
  const navigate = useNavigate();

  // Stable ref to avoid stale closure in the session-expired handler.
  const navigateRef = useRef(navigate);
  useEffect(() => {
    navigateRef.current = navigate;
  }, [navigate]);

  // ── Initial session check ──────────────────────────────────────────────────
  const refreshMe = useCallback(async () => {
    try {
      const user = await fetchApi<PublicUser>('/auth/me');
      setState({ status: 'authenticated', user });
    } catch {
      // Non-2xx or network error → treat as anonymous (Req 4.7).
      setState({ status: 'anonymous' });
    }
  }, []);

  useEffect(() => {
    refreshMe();
  }, [refreshMe]);

  // ── Session-expired event listener ────────────────────────────────────────
  useEffect(() => {
    let clearTimer: ReturnType<typeof setTimeout> | null = null;

    function handleSessionExpired() {
      // Clear user within 1 second (Req 10.2).
      clearTimer = setTimeout(() => {
        setState({ status: 'anonymous' });
        navigateRef.current('/login');
      }, 1000);
    }

    window.addEventListener('wms.session-expired', handleSessionExpired);
    return () => {
      window.removeEventListener('wms.session-expired', handleSessionExpired);
      if (clearTimer !== null) clearTimeout(clearTimer);
    };
  }, []); // subscribe once

  // ── Login ──────────────────────────────────────────────────────────────────
  const login = useCallback(
    async (email: string, password: string): Promise<{ ok: boolean; error?: string }> => {
      try {
        const res = await fetchApi<{ ok: boolean; user: PublicUser }>('/auth/login', {
          method: 'POST',
          body: JSON.stringify({ email, password }),
        });
        setState({ status: 'authenticated', user: res.user });
        return { ok: true };
      } catch (err) {
        if (err instanceof ApiError) {
          return { ok: false, error: 'invalid_credentials' };
        }
        return { ok: false, error: 'invalid_credentials' };
      }
    },
    [],
  );

  // ── Logout ─────────────────────────────────────────────────────────────────
  const logout = useCallback(async () => {
    try {
      await fetchApi('/auth/logout', { method: 'POST' });
    } catch {
      // Best-effort — proceed with local state clear regardless.
    }
    setState({ status: 'anonymous' });
    navigateRef.current('/login');
  }, []);

  // ── Change password ──────────────────────────────────────────────────────
  const changePassword = useCallback(
    async (
      currentPassword: string,
      newPassword: string,
    ): Promise<{ ok: boolean; error?: string }> => {
      try {
        await fetchApi('/auth/change-password', {
          method: 'POST',
          body: JSON.stringify({ currentPassword, newPassword }),
        });
        return { ok: true };
      } catch (err) {
        if (err instanceof ApiError) {
          if (err.status === 400) {
            // Could be wrong current password or validation error.
            return { ok: false, error: err.message || 'invalid' };
          }
          return { ok: false, error: err.message };
        }
        return { ok: false, error: 'unknown_error' };
      }
    },
    [],
  );

  const value: AuthApi = { state, login, logout, refreshMe, changePassword };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Returns the current auth API. Must be used inside an `<AuthProvider>`.
 */
export function useAuth(): AuthApi {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside <AuthProvider>');
  }
  return ctx;
}
