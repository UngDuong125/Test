'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
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
  const { user, loading } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
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
  }, [user, loading, router, roles, allowMustChange]);

  if (loading || !user) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-slate-500">
        Đang kiểm tra phiên…
      </div>
    );
  }

  if (user.mustChangePassword && !allowMustChange) return null;
  if (roles && !roles.includes(user.role)) return null;

  return <>{children}</>;
}
