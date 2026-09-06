'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { AuthGate } from '@/components/auth/AuthGate';
import {
  ApiError,
  inviteUser,
  listUsers,
  resendInvite,
  updateUserRole,
  updateUserStatus,
} from '@/lib/api-client';
import type { PublicUser, UserRole, UserStatus } from '@/types/auth';
import { suggestUsernameFromEmail } from '@/lib/validation';

function suggestFromEmail(email: string): string {
  return suggestUsernameFromEmail(email);
}

function UsersAdmin() {
  const [users, setUsers] = useState<PublicUser[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [role, setRole] = useState<UserRole>('student');
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listUsers();
      setUsers(data.users);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Không tải được danh sách');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function onInvite(e: FormEvent) {
    e.preventDefault();
    setMessage(null);
    setError(null);
    try {
      const result = await inviteUser({
        email,
        username,
        role,
        displayName: displayName || undefined,
      });
      setMessage(
        result.emailDelivered
          ? `Đã mời ${result.user.email} (@${result.user.username})`
          : `Đã tạo ${result.user.email} (@${result.user.username}) — mật khẩu tạm xem console backend (chưa cấu hình SMTP)`,
      );
      setEmail('');
      setUsername('');
      setDisplayName('');
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Invite thất bại');
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl font-bold text-ink">Quản lý tài khoản</h1>
        <p className="mt-2 text-sm text-slate-600">Mời user, gán role và khóa / vô hiệu hóa tài khoản.</p>
      </div>

      <form onSubmit={onInvite} className="grid gap-3 rounded-xl border border-mist bg-white p-5 shadow-sm md:grid-cols-4">
        <input
          type="email"
          required
          placeholder="email@school.edu"
          value={email}
          onChange={(e) => {
            const next = e.target.value;
            setEmail(next);
            if (!username || username === suggestFromEmail(email)) {
              setUsername(suggestFromEmail(next));
            }
          }}
          className="rounded-md border border-mist px-3 py-2 text-sm md:col-span-2"
        />
        <input
          type="text"
          required
          minLength={3}
          maxLength={32}
          pattern="[a-zA-Z0-9][a-zA-Z0-9._-]{2,31}"
          placeholder="tên đăng nhập"
          value={username}
          onChange={(e) => setUsername(e.target.value.toLowerCase())}
          className="rounded-md border border-mist px-3 py-2 text-sm"
        />
        <input
          type="text"
          placeholder="Tên hiển thị (tuỳ chọn)"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          className="rounded-md border border-mist px-3 py-2 text-sm"
        />
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as UserRole)}
          className="rounded-md border border-mist px-3 py-2 text-sm"
        >
          <option value="student">student</option>
          <option value="teacher">teacher</option>
          <option value="admin">admin</option>
        </select>
        <button
          type="submit"
          className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accentDark md:col-span-4 md:w-fit"
        >
          Mời tài khoản
        </button>
      </form>

      {message && <p className="text-sm text-teal-700">{message}</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="overflow-x-auto rounded-xl border border-mist bg-white shadow-sm">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-mist bg-slate-50 text-slate-600">
            <tr>
              <th className="px-4 py-3 font-medium">Email / username</th>
              <th className="px-4 py-3 font-medium">Role</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-slate-500">
                  Đang tải…
                </td>
              </tr>
            ) : (
              users.map((u) => (
                <tr key={u.id} className="border-b border-mist/70">
                  <td className="px-4 py-3">
                    <div className="font-medium text-ink">{u.displayName || u.username}</div>
                    <div className="text-xs text-slate-500">
                      @{u.username} · {u.email}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={u.role}
                      onChange={(e) => {
                        void updateUserRole(u.id, e.target.value)
                          .then(refresh)
                          .catch((err) =>
                            setError(err instanceof ApiError ? err.message : 'Đổi role thất bại'),
                          );
                      }}
                      className="rounded border border-mist px-2 py-1"
                    >
                      <option value="admin">admin</option>
                      <option value="teacher">teacher</option>
                      <option value="student">student</option>
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={u.status}
                      onChange={(e) => {
                        void updateUserStatus(u.id, e.target.value as UserStatus)
                          .then(refresh)
                          .catch((err) =>
                            setError(err instanceof ApiError ? err.message : 'Đổi status thất bại'),
                          );
                      }}
                      className="rounded border border-mist px-2 py-1"
                    >
                      <option value="invited">invited</option>
                      <option value="active">active</option>
                      <option value="locked">locked</option>
                      <option value="disabled">disabled</option>
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    {(u.status === 'invited' || u.mustChangePassword) && (
                      <button
                        type="button"
                        className="text-accentDark hover:underline"
                        onClick={() => {
                          void resendInvite(u.id)
                            .then((r) =>
                              setMessage(
                                r.emailDelivered
                                  ? `Đã gửi lại lời mời tới ${u.email}`
                                  : `Đã tạo lại mật khẩu tạm — xem console backend`,
                              ),
                            )
                            .catch((err) =>
                              setError(err instanceof ApiError ? err.message : 'Resend thất bại'),
                            );
                        }}
                      >
                        Gửi lại invite
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function AdminUsersPage() {
  return (
    <AuthGate roles={['admin']}>
      <UsersAdmin />
    </AuthGate>
  );
}
