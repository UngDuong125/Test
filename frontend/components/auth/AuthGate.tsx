'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { StartupSkeleton } from '@/components/ui/StartupNotice';
import { useSession } from '@/lib/auth';
import type { UserRole } from '@/types/auth';

export function AuthGate({
  children,
  roles,
  allowMustChange = false,
}: {
  children: React.ReactNode;
  roles?: UserRole[];
  allowMustChange?: boolean;
}) {
  const { user, loading, error, refresh } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    // Network / server error is not "logged out": stay and offer a retry.
    if (!user && error) return;
    if (!user) {
      router.replace('/login');
      return;
    }
    if (user.mustChangePassword && !allowMustChange) {
      router.replace('/change-password');
      return;
    }
    if (roles && !roles.includes(user.role)) {
      router.replace('/dashboard');
    }
  }, [user, loading, error, router, roles, allowMustChange]);

  if (loading || !user) {
    return (
      <StartupSkeleton
        error={!loading && !user ? error : null}
        onRetry={() => void refresh()}
      />
    );
  }

  if (user.mustChangePassword && !allowMustChange) return null;
  if (roles && !roles.includes(user.role)) return null;

  return <>{children}</>;
}
