'use client';

import { useEffect, useState } from 'react';

/** After this long without a response, tell the user the server is waking up. */
export const STARTUP_NOTICE_MS = 3_000;
/** After this long, stop waiting and offer a retry. */
export const STARTUP_GIVE_UP_MS = 60_000;

/** True once `active` has stayed true for `ms`. Resets when `active` turns false. */
export function useElapsedFlag(active: boolean, ms: number): boolean {
  const [elapsed, setElapsed] = useState(false);
  useEffect(() => {
    if (!active) {
      setElapsed(false);
      return;
    }
    const timer = setTimeout(() => setElapsed(true), ms);
    return () => clearTimeout(timer);
  }, [active, ms]);
  return elapsed;
}

/** One-line message shown under a pending action once the server looks asleep. */
export function StartupHint({ active }: { active: boolean }) {
  const slow = useElapsedFlag(active, STARTUP_NOTICE_MS);
  if (!slow) return null;
  return (
    <p className="text-sm text-slate-500" role="status" aria-live="polite">
      Hệ thống đang khởi động, vui lòng chờ trong giây lát…
    </p>
  );
}

function SkeletonBar({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-md bg-mist ${className}`} />;
}

/**
 * Page-shaped placeholder while the session loads. Keeps the layout stable,
 * explains a cold start after 3s and offers a retry after 60s or on error.
 */
export function StartupSkeleton({
  error,
  onRetry,
}: {
  error?: string | null;
  onRetry?: () => void;
}) {
  const slow = useElapsedFlag(!error, STARTUP_NOTICE_MS);
  const gaveUp = useElapsedFlag(!error, STARTUP_GIVE_UP_MS);
  const failed = Boolean(error) || gaveUp;

  return (
    <div className="space-y-6" aria-busy={!failed}>
      <div className="space-y-3">
        <SkeletonBar className="h-8 w-48" />
        <SkeletonBar className="h-4 w-72 max-w-full" />
      </div>

      {failed ? (
        <div
          className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
          role="alert"
        >
          <p>
            {error
              ? 'Không kết nối được tới máy chủ.'
              : 'Máy chủ phản hồi quá lâu.'}{' '}
            Vui lòng kiểm tra mạng rồi thử lại.
          </p>
          <button
            type="button"
            onClick={() => (onRetry ? onRetry() : window.location.reload())}
            className="mt-2 rounded-md bg-accent px-3 py-1.5 text-white hover:bg-accentDark"
          >
            Thử lại
          </button>
        </div>
      ) : (
        slow && (
          <p
            className="flex items-center gap-2 rounded-lg border border-mist bg-white px-4 py-3 text-sm text-slate-600"
            role="status"
            aria-live="polite"
          >
            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-accent border-t-transparent" />
            Hệ thống đang khởi động, vui lòng chờ trong giây lát…
          </p>
        )
      )}

      <div className="space-y-3 rounded-xl border border-mist bg-white p-6">
        <SkeletonBar className="h-5 w-40" />
        <SkeletonBar className="h-4 w-full" />
        <SkeletonBar className="h-4 w-5/6" />
        <SkeletonBar className="h-4 w-2/3" />
      </div>
    </div>
  );
}
