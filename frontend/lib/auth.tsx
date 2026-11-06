'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { ApiError, getMe, logout as apiLogout } from '@/lib/api-client';
import type { PublicUser } from '@/types/auth';

type SessionValue = {
  user: PublicUser | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
  setUser: (user: PublicUser | null) => void;
};

const SessionContext = createContext<SessionValue | null>(null);

/** One in-flight /me for this page load, shared by header, gate and pages. */
let meRequest: Promise<PublicUser | null> | null = null;

function loadMe(): Promise<PublicUser | null> {
  if (!meRequest) {
    meRequest = getMe()
      .then(({ user }) => user)
      .catch((err: unknown) => {
        if (err instanceof ApiError && err.status === 401) return null;
        meRequest = null;
        throw err;
      });
  }
  return meRequest;
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [user, setUserState] = useState<PublicUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    meRequest = null;
    try {
      setUserState(await loadMe());
    } catch (err) {
      setUserState(null);
      setError(err instanceof Error ? err.message : 'Failed to load session');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadMe()
      .then((me) => {
        if (!cancelled) setUserState(me);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setUserState(null);
        setError(err instanceof Error ? err.message : 'Failed to load session');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const setUser = useCallback((next: PublicUser | null) => {
    setUserState(next);
    setError(null);
    setLoading(false);
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiLogout();
    } finally {
      meRequest = null;
      setUserState(null);
    }
  }, []);

  const value = useMemo(
    () => ({ user, loading, error, refresh, logout, setUser }),
    [user, loading, error, refresh, logout, setUser],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) {
    throw new Error('useSession must be used within SessionProvider');
  }
  return value;
}

export function displayNameOf(user: PublicUser): string {
  return user.displayName?.trim() || user.username || user.email?.split('@')[0] || '—';
}
