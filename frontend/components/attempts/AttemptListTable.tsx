import Link from 'next/link';
import { attemptStatusLabel, formatAttemptScore } from '@/lib/attempt-labels';
import type { Attempt } from '@/types/content';

type Props = {
  items: Attempt[];
  emptyText?: string;
  showExamId?: boolean;
  showUserId?: boolean;
  detailHref?: (attempt: Attempt) => string;
};

export function AttemptListTable({
  items,
  emptyText = 'Chưa có lượt làm bài.',
  showExamId = false,
  showUserId = true,
  detailHref = (a) => `/results/${a.id}`,
}: Props) {
  if (items.length === 0) {
    return <p className="text-sm text-slate-500">{emptyText}</p>;
  }

  return (
    <ul className="divide-y divide-mist text-sm">
      {items.map((a) => {
        const href = detailHref(a);
        const isLive = a.status === 'in_progress';
        return (
          <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div className="min-w-0">
              <p className="font-medium text-ink">
                {attemptStatusLabel(a.status)}
                {isLive && (
                  <span className="ml-2 text-xs font-normal text-amber-700">· tiến độ</span>
                )}
              </p>
              <p className="text-slate-500">
                {showUserId && <span>HS {a.userId.slice(0, 8)}… · </span>}
                {showExamId && <span>Đề {a.examId.slice(0, 8)}… · </span>}
                Bắt đầu {new Date(a.startedAt).toLocaleString()}
                {a.submittedAt && <> · Nộp {new Date(a.submittedAt).toLocaleString()}</>}
              </p>
              <p className="text-xs text-slate-400">
                Điểm: {formatAttemptScore(a.score, a.maxScore, a.percentage)}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {a.status === 'needs_grading' && (
                <Link
                  href={`/grading/${a.id}`}
                  className="rounded-md border border-mist px-3 py-1.5 hover:border-accent"
                >
                  Chấm
                </Link>
              )}
              <Link
                href={href}
                className="rounded-md bg-accent px-3 py-1.5 text-white hover:bg-accentDark"
              >
                {isLive ? 'Xem tiến độ' : 'Chi tiết'}
              </Link>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
