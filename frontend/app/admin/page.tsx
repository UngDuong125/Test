import Link from 'next/link';

export default function AdminHomePage() {
  return (
    <div className="space-y-4">
      <h1 className="font-display text-3xl font-bold text-ink">Admin</h1>
      <p className="text-slate-600">Công cụ quản trị hệ thống.</p>
      <Link href="/admin/users" className="text-accentDark hover:underline">
        Quản lý người dùng →
      </Link>
    </div>
  );
}
