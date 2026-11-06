'use client';

import { FormEvent, useState } from 'react';
import { ApiError, updateMyProfile } from '@/lib/api-client';
import { useSession } from '@/lib/auth';

/** Student controls for how they appear on the leaderboard: nickname and hide. */
export function LeaderboardPrivacyCard({ onChanged }: { onChanged?: () => void }) {
  const { user, setUser } = useSession();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(user?.displayName ?? '');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  if (!user || user.role !== 'student') return null;
  const hidden = Boolean(user.leaderboardHidden);

  async function save(patch: { displayName?: string | null; leaderboardHidden?: boolean }) {
    setBusy(true);
    setMessage(null);
    try {
      const res = await updateMyProfile(patch);
      setUser(res.user);
      setMessage({ ok: true, text: 'Đã lưu.' });
      onChanged?.();
    } catch (err) {
      setMessage({ ok: false, text: err instanceof ApiError ? err.message : 'Lưu thất bại' });
    } finally {
      setBusy(false);
    }
  }

  function onSubmitName(e: FormEvent) {
    e.preventDefault();
    void save({ displayName: name.trim() || null });
  }

  return (
    <section className="rounded-xl border border-mist bg-white p-4 text-sm shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between text-left"
      >
        <span className="font-medium text-ink">
          Bạn hiển thị là: {user.displayName?.trim() || user.username}
          {hidden && <span className="ml-2 text-xs font-normal text-slate-500">(đang ẩn khỏi bảng)</span>}
        </span>
        <span className="text-accentDark">{open ? 'Đóng' : 'Đổi'}</span>
      </button>
      {open && (
        <div className="mt-3 space-y-3">
          <form onSubmit={onSubmitName} className="flex flex-wrap items-end gap-2">
            <label className="flex-1">
              Biệt danh trên bảng xếp hạng
              <input
                value={name}
                maxLength={60}
                onChange={(e) => setName(e.target.value)}
                placeholder={user.username}
                className="mt-1 w-full rounded-md border border-mist px-3 py-1.5"
              />
            </label>
            <button
              type="submit"
              disabled={busy}
              className="rounded-md border border-mist px-3 py-1.5 hover:border-accent disabled:opacity-50"
            >
              Lưu biệt danh
            </button>
          </form>
          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              checked={hidden}
              disabled={busy}
              onChange={(e) => void save({ leaderboardHidden: e.target.checked })}
              className="mt-0.5"
            />
            <span>
              Ẩn tôi khỏi bảng xếp hạng
              <span className="block text-xs text-slate-500">
                Bạn bè không thấy tên bạn; bạn vẫn thấy hạng của mình. EXP vẫn được tính.
              </span>
            </span>
          </label>
          {message && (
            <p className={message.ok ? 'text-emerald-700' : 'text-red-700'}>{message.text}</p>
          )}
        </div>
      )}
    </section>
  );
}
