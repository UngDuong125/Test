'use client';

import { useCallback, useEffect, useState } from 'react';
import { ApiError, getMe, logout as apiLogout } from '@/lib/api-client';
import type { PublicUser } from '@/types/auth';

export function useSession() {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { user: me } = await getMe();
      setUser(me);
    } catch (err) {
      setUser(null);
      if (!(err instanceof ApiError && err.status === 401)) {
        setError(err instanceof Error ? err.message : 'Failed to load session');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const logout = useCallback(async () => {
    try {
      await apiLogout();
    } finally {
      setUser(null);
    }
  }, []);

  return { user, loading, error, refresh, logout, setUser };
}

export function displayNameOf(user: PublicUser): string {
  return user.displayName?.trim() || user.username || user.email.split('@')[0] || user.email;
}
