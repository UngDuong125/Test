'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { AuthGate } from '@/components/auth/AuthGate';
import { StatsPanel } from '@/components/analytics/StatsPanel';
import {
  ApiError,
  addClassMembers,
  createClass,
  getClassAnalytics,
  listClassMembers,
  listClasses,
  removeClassMember,
} from '@/lib/api-client';
import type { ClassMember, ClassRecord } from '@/types/content';

function ClassesBody() {
  const [items, setItems] = useState<ClassRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [members, setMembers] = useState<ClassMember[]>([]);
  const [form, setForm] = useState({ name: '', grade: 7 });
  const [emails, setEmails] = useState('');
  const [analytics, setAnalytics] = useState<{
    assignedCount: number;
    completedCount: number;
    attemptCount: number;
    gradedCount: number;
    averagePercentage: number | null;
    expTotal: number;
  } | null>(null);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const res = await listClasses();
      setItems(res.items);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Không tải được lớp');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function openClass(id: string) {
    setSelectedId(id);
    setError(null);
    try {
      const [mem, stats] = await Promise.all([
        listClassMembers(id),
        getClassAnalytics(id).catch(() => null),
      ]);
      setMembers(mem.members);
      setAnalytics(stats);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Không tải thành viên');
    }
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const { class: cls } = await createClass(form);
      setForm({ name: '', grade: form.grade });
      await refresh();
      await openClass(cls.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Tạo lớp thất bại');
    }
  }

  async function onAddMembers(e: FormEvent) {
    e.preventDefault();
    if (!selectedId) return;
    setError(null);
    const list = emails
      .split(/[\s,;]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    try {
      const res = await addClassMembers(selectedId, { emails: list });
      if (res.errors.length) {
        setError(res.errors.map((x) => `${x.identifier}: ${x.message}`).join('; '));
      }
      setEmails('');
      await openClass(selectedId);
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Thêm học sinh thất bại');
    }
  }

  async function onRemove(userId: string) {
    if (!selectedId) return;
    setError(null);
    try {
      await removeClassMember(selectedId, userId);
      await openClass(selectedId);
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Xóa thành viên thất bại');
    }
  }

  const selected = items.find((c) => c.id === selectedId) ?? null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold text-ink">Lớp học</h1>
        <p className="mt-2 text-slate-600">
          Tạo lớp, thêm học sinh active — dùng khi giao đề theo lớp (expand per student).
        </p>
      </div>

      {error && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="space-y-4">
          <form onSubmit={onCreate} className="space-y-3 rounded-xl border border-mist bg-white p-4">
            <p className="font-semibold text-ink">Tạo lớp</p>
            <input
              className="w-full rounded-md border border-mist px-3 py-2 text-sm"
              placeholder="Tên lớp (vd. 7A1)"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              required
            />
            <input
              type="number"
              min={6}
              max={9}
              className="w-full rounded-md border border-mist px-3 py-2 text-sm"
              value={form.grade}
              onChange={(e) => setForm((f) => ({ ...f, grade: Number(e.target.value) }))}
              required
            />
            <button
              type="submit"
              className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accentDark"
            >
              Tạo
            </button>
          </form>

          <div className="rounded-xl border border-mist bg-white p-4">
            <p className="font-semibold text-ink">Danh sách</p>
            {loading ? (
              <p className="mt-2 text-sm text-slate-500">Đang tải…</p>
            ) : items.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">Chưa có lớp.</p>
            ) : (
              <ul className="mt-3 divide-y divide-mist">
                {items.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => void openClass(c.id)}
                      className={`w-full px-1 py-2 text-left text-sm hover:bg-slate-50 ${
                        selectedId === c.id ? 'text-accentDark font-medium' : 'text-slate-700'
                      }`}
                    >
                      {c.name} · khối {c.grade} · {c.memberCount ?? 0} HS
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section className="rounded-xl border border-mist bg-white p-4">
          {!selected ? (
            <p className="text-sm text-slate-500">Chọn một lớp để quản lý thành viên.</p>
          ) : (
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-ink">{selected.name}</p>
                  <p className="text-sm text-slate-500">Khối {selected.grade}</p>
                </div>
                <Link
                  href={`/assignments?classId=${selected.id}`}
                  className="text-sm text-accentDark hover:underline"
                >
                  Giao đề →
                </Link>
              </div>

              {analytics && (
                <StatsPanel
                  title="Thống kê lớp"
                  items={[
                    { label: 'Đã giao (HS)', value: analytics.assignedCount },
                    { label: 'Đã làm', value: analytics.completedCount },
                    { label: 'Lượt attempt', value: analytics.attemptCount },
                    { label: 'Đã chấm', value: analytics.gradedCount },
                    {
                      label: '% TB',
                      value:
                        analytics.averagePercentage != null
                          ? `${analytics.averagePercentage}%`
                          : null,
                    },
                    { label: 'EXP lớp', value: analytics.expTotal },
                  ]}
                />
              )}

              <form onSubmit={onAddMembers} className="space-y-2">
                <label className="text-sm font-medium text-slate-700">
                  Thêm học sinh (email, cách nhau bằng dấu phẩy)
                </label>
                <textarea
                  className="w-full rounded-md border border-mist px-3 py-2 text-sm"
                  rows={2}
                  value={emails}
                  onChange={(e) => setEmails(e.target.value)}
                  placeholder="student1@testarchive.local"
                  required
                />
                <button
                  type="submit"
                  className="rounded-md border border-mist px-3 py-1.5 text-sm hover:border-accent"
                >
                  Thêm
                </button>
              </form>

              <ul className="divide-y divide-mist text-sm">
                {members.map((m) => (
                  <li key={m.userId} className="flex items-center justify-between gap-2 py-2">
                    <span>
                      {m.displayName || m.username || m.email}{' '}
                      <span className="text-slate-400">{m.email}</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => void onRemove(m.userId)}
                      className="text-red-600 hover:underline"
                    >
                      Xóa
                    </button>
                  </li>
                ))}
                {members.length === 0 && (
                  <li className="py-2 text-slate-500">Chưa có thành viên.</li>
                )}
              </ul>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

export default function ClassesPage() {
  return (
    <AuthGate roles={['admin', 'teacher']}>
      <ClassesBody />
    </AuthGate>
  );
}
