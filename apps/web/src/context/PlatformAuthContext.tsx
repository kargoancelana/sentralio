/**
 * PlatformAuthContext - auth state untuk portal Super Admin (/platform).
 *
 * Cermin AuthContext tenant tapi untuk platform_admins:
 *  - endpoint di /api/platform/auth/* (login, me, logout)
 *  - identitas { id, email, name } (super admin global, tanpa role/company)
 *  - pakai fetch sendiri (platformFetch) supaya 401 wajar pada cek /me saat
 *    anonim TIDAK men-dispatch event tenant 'wms.session-expired'.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useNavigate } from 'react-router-dom';

export interface PlatformAdmin {
  id: number;
  email: string;
  name: string;
}

export type PlatformAuthState =
  | { status: 'loading' }
  | { status: 'anonymous' }
  | { status: 'authenticated'; admin: PlatformAdmin };

export interface PlatformAuthApi {
  state: PlatformAuthState;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshMe: () => Promise<void>;
}

/** Error yang dilempar platformFetch saat respons non-OK. */
export class PlatformApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'PlatformApiError';
    this.status = status;
  }
}

/**
 * Fetch khusus endpoint platform. Beda dengan fetchApi (lib/api), ini TIDAK
 * pernah men-dispatch 'wms.session-expired', jadi 401 wajar (cek /me anonim)
 * tidak mengganggu sesi app tenant.
 */
async function platformFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`/api/platform${path}`, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    ...options,
  });

  let data: unknown = null;
  const text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }

  if (!res.ok) {
    const message =
      data && typeof data === 'object' && 'error' in data
        ? String((data as Record<string, unknown>).error)
        : `Request failed (${res.status})`;
    throw new PlatformApiError(res.status, message);
  }

  return data as T;
}

const PlatformAuthContext = createContext<PlatformAuthApi | null>(null);

export function PlatformAuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PlatformAuthState>({ status: 'loading' });
  const navigate = useNavigate();

  const refreshMe = useCallback(async () => {
    try {
      const admin = await platformFetch<PlatformAdmin>('/auth/me');
      setState({ status: 'authenticated', admin });
    } catch {
      setState({ status: 'anonymous' });
    }
  }, []);

  useEffect(() => {
    void refreshMe();
  }, [refreshMe]);

  const login = useCallback(async (email: string, password: string) => {
    const result = await platformFetch<{ ok: boolean; admin: PlatformAdmin }>(
      '/auth/login',
      {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      },
    );
    setState({ status: 'authenticated', admin: result.admin });
  }, []);

  const logout = useCallback(async () => {
    try {
      await platformFetch('/auth/logout', { method: 'POST' });
    } finally {
      setState({ status: 'anonymous' });
      navigate('/platform/login', { replace: true });
    }
  }, [navigate]);

  const api = useMemo<PlatformAuthApi>(
    () => ({ state, login, logout, refreshMe }),
    [state, login, logout, refreshMe],
  );

  return <PlatformAuthContext.Provider value={api}>{children}</PlatformAuthContext.Provider>;
}

export function usePlatformAuth(): PlatformAuthApi {
  const ctx = useContext(PlatformAuthContext);
  if (!ctx) {
    throw new Error('usePlatformAuth must be used within a PlatformAuthProvider');
  }
  return ctx;
}
