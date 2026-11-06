'use client';

import type { QuestionAnswer } from '@/types/content';

function correctIds(answer: QuestionAnswer | undefined): Set<string> {
  if (!answer) return new Set();
  if (answer.type === 'single') return new Set([answer.value]);
  if (answer.type === 'multiple') return new Set(answer.value);
  return new Set();
}

/**
 * Horizontal bars: share of students who picked each option. One hue; the correct
 * option is marked with text and an icon so identity never depends on color.
 */
export function OptionStatsChart({
  stats,
  answer,
  multiple,
}: {
  stats: { optionId: string; selectedCount: number; selectedRate: number }[];
  answer?: QuestionAnswer;
  multiple: boolean;
}) {
  const correct = correctIds(answer);
  const total = stats.reduce((s, o) => s + o.selectedCount, 0);
  if (total === 0) return null;

  // The wrong option most students fell for: a likely misconception or a wrong key.
  const topDistractor = [...stats]
    .filter((o) => !correct.has(o.optionId))
    .sort((a, b) => b.selectedRate - a.selectedRate)[0];

  return (
    <section className="space-y-3 rounded-xl border border-mist bg-white p-6 shadow-sm">
      <div>
        <p className="font-semibold text-ink">Tỉ lệ chọn từng phương án</p>
        <p className="text-xs text-slate-500">
          Trên các lượt đã chấm có trả lời.
          {multiple && ' Câu nhiều đáp án: một học sinh có thể chọn nhiều phương án.'}
        </p>
      </div>
      <table className="w-full text-sm">
        <caption className="sr-only">Tỉ lệ chọn từng phương án</caption>
        <tbody>
          {stats.map((o) => {
            const pct = Math.round(o.selectedRate * 100);
            const isCorrect = correct.has(o.optionId);
            return (
              <tr key={o.optionId}>
                <th scope="row" className="w-28 py-1.5 pr-3 text-left font-medium text-ink">
                  {o.optionId}
                  {isCorrect && <span className="ml-1 text-xs font-normal text-slate-600">✓ đúng</span>}
                </th>
                <td className="py-1.5">
                  <div className="flex items-center gap-2">
                    <div className="h-3 flex-1 rounded-sm bg-mist/60">
                      <div
                        className="h-3 rounded-r bg-accent"
                        style={{ width: `${Math.max(pct, pct > 0 ? 2 : 0)}%` }}
                      />
                    </div>
                    <span className="w-24 text-right tabular-nums text-slate-700">
                      {pct}% ({o.selectedCount})
                    </span>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {topDistractor && topDistractor.selectedRate >= 0.3 && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
          ⚠ {Math.round(topDistractor.selectedRate * 100)}% học sinh chọn phương án sai{' '}
          <strong>{topDistractor.optionId}</strong>. Nên kiểm tra lại đáp án hoặc cách diễn đạt.
        </p>
      )}
    </section>
  );
}
