import Link from 'next/link';

export default function HomePage() {
  return (
    <section className="grid gap-10 py-10 md:grid-cols-[1.1fr_0.9fr] md:items-center">
      <div className="space-y-5">
        <p className="font-display text-4xl font-bold tracking-tight text-ink md:text-5xl">
          TestArchive
        </p>
        <h1 className="text-xl font-medium text-slate-700 md:text-2xl">
          Ngân hàng câu hỏi, bộ đề và làm bài cho học sinh THCS
        </h1>
        <p className="max-w-xl text-slate-600">
          Đăng nhập để xem assignment, quản lý đề hoặc mời tài khoản. Quyền truy cập được kiểm soát
          phía server theo role admin, teacher và student.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/login"
            className="rounded-md bg-accent px-5 py-2.5 text-sm font-semibold text-white hover:bg-accentDark"
          >
            Đăng nhập
          </Link>
          <Link
            href="/dashboard"
            className="rounded-md border border-mist bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 hover:border-accent"
          >
            Vào dashboard
          </Link>
        </div>
      </div>
      <div
        className="min-h-[220px] rounded-2xl border border-mist bg-gradient-to-br from-teal-50 via-white to-slate-100 p-6 shadow-sm"
        aria-hidden
      >
        <div className="space-y-3 text-sm text-slate-600">
          <p className="font-semibold text-ink">Đã có — bước 1–6</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>Auth, câu hỏi, đề, giao đề</li>
            <li>Làm bài · chấm · kết quả · EXP</li>
            <li>Leaderboard theo kỳ + analytics</li>
          </ul>
        </div>
      </div>
    </section>
  );
}
