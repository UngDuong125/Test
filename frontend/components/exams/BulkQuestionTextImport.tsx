'use client';

import { useMemo, useState, type ReactNode } from 'react';
import {
  BULK_EXAMPLE_TEXT,
  BULK_FORMAT_HELP,
  BULK_SUPPORTED_TYPES,
  parseBulkQuestionText,
  templateForType,
  type BulkQuestionCreatePayload,
  type BulkSupportedType,
} from '@/lib/bulk-question-text';
import { ApiError, createTopic } from '@/lib/api-client';
import { topicNameKey, useTopics } from '@/lib/topics';
import { ContentBlocksView, OptionContentView } from '@/components/questions/QuestionPreview';
import { TopicPicker } from '@/components/questions/TopicPicker';
import type { TagKey } from '@/types/auth';
import type { Topic } from '@/types/content';

const TYPE_LABEL: Record<BulkSupportedType, string> = {
  multiple_choice: 'Trắc nghiệm',
  true_false: 'Đúng / Sai',
  fill_blank: 'Điền khuyết',
  short_answer: 'Trả lời ngắn',
};

type Props = {
  /** Môn/lớp của đề — dùng để đổi tên chủ đề thành id và tạo chủ đề thiếu. */
  subjectId: TagKey;
  grade: number;
  onCreateOne: (payload: BulkQuestionCreatePayload) => Promise<void>;
  footerExtra?: ReactNode;
  onClose?: () => void;
  onComplete?: (count: number) => void;
};

export function BulkQuestionTextImport({
  subjectId,
  grade,
  onCreateOne,
  footerExtra,
  onClose,
  onComplete,
}: Props) {
  const [text, setText] = useState(BULK_EXAMPLE_TEXT);
  const [defaultType, setDefaultType] = useState<BulkSupportedType | ''>('');
  const topicSource = useTopics(subjectId, grade);
  const [defaultTopicIds, setDefaultTopicIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [createdCount, setCreatedCount] = useState(0);

  const parsed = useMemo(
    () =>
      parseBulkQuestionText(text, {
        defaultType: defaultType || undefined,
      }),
    [text, defaultType],
  );

  const okItems = parsed.filter((p) => p.ok);
  const errItems = parsed.filter((p) => !p.ok);

  const topicByKey = useMemo(() => {
    const map = new Map<string, Topic>();
    for (const t of topicSource.topics) map.set(topicNameKey(t.name), t);
    return map;
  }, [topicSource.topics]);

  const defaultTopicNames = useMemo(
    () =>
      defaultTopicIds
        .map((id) => topicSource.topics.find((t) => t.id === id)?.name)
        .filter((n): n is string => Boolean(n)),
    [defaultTopicIds, topicSource.topics],
  );

  /** Default topics + names from `TOPIC:`, deduped case-insensitively. */
  function itemTopics(names: string[]): { name: string; isNew: boolean }[] {
    const seen = new Set<string>();
    const out: { name: string; isNew: boolean }[] = [];
    for (const name of [...defaultTopicNames, ...names]) {
      const key = topicNameKey(name);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ name, isNew: !topicByKey.has(key) });
    }
    return out;
  }

  async function resolveTopicIds(): Promise<Map<string, string>> {
    const ids = new Map<string, string>();
    for (const [key, t] of topicByKey) ids.set(key, t.id);
    for (const item of okItems) {
      if (!item.ok) continue;
      for (const name of item.payload.topicNames) {
        const key = topicNameKey(name);
        if (ids.has(key)) continue;
        const { topic } = await createTopic({ subjectId, name, grade });
        topicSource.addTopic(topic);
        ids.set(key, topic.id);
      }
    }
    return ids;
  }

  function insertTemplate(type: BulkSupportedType) {
    const block = templateForType(type);
    setText((prev) => {
      const trimmed = prev.trim();
      if (!trimmed) return `===\n${block}\n===`;
      return `${trimmed}\n===\n${block}\n===`;
    });
  }

  async function onCreate() {
    if (!okItems.length || errItems.length) return;
    setBusy(true);
    setError(null);
    setCreatedCount(0);
    let done = 0;
    let topicIdByKey: Map<string, string>;
    try {
      setProgress('Đang chuẩn bị chủ đề…');
      topicIdByKey = await resolveTopicIds();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? `Không tạo được chủ đề: ${err.message}`
          : 'Không tạo được chủ đề',
      );
      setProgress(null);
      setBusy(false);
      return;
    }
    try {
      for (const item of okItems) {
        if (!item.ok) continue;
        setProgress(`Đang tạo câu ${done + 1}/${okItems.length}…`);
        const { topicNames, ...rest } = item.payload;
        const topicIds = [
          ...new Set([
            ...defaultTopicIds,
            ...topicNames
              .map((n) => topicIdByKey.get(topicNameKey(n)))
              .filter((id): id is string => Boolean(id)),
          ]),
        ];
        await onCreateOne({ ...rest, topicIds });
        done += 1;
        setCreatedCount(done);
      }
      setProgress(null);
      setText('');
      setCreatedCount(done);
      onComplete?.(done);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? `Dừng ở câu ${done + 1}/${okItems.length}: ${err.message}`
          : `Dừng ở câu ${done + 1}/${okItems.length}: tạo thất bại`,
      );
      setProgress(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-semibold text-ink">Tạo nhanh từ text</h2>
          <p className="text-xs text-slate-500">
            Dán nhiều câu theo định dạng field → xem trước → tạo hàng loạt (TN, Đ/S, điền,
            ngắn).
          </p>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="text-xs text-slate-500 hover:text-ink"
          >
            Đóng
          </button>
        )}
      </div>

      <div className="rounded-md border border-mist/70 bg-slate-50/60 px-3 py-2 text-xs whitespace-pre-wrap text-slate-600">
        {BULK_FORMAT_HELP}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-slate-500">Chèn mẫu:</span>
        {BULK_SUPPORTED_TYPES.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => insertTemplate(t)}
            className="rounded-md border border-mist px-2 py-1 text-xs hover:border-accent"
          >
            {TYPE_LABEL[t]}
          </button>
        ))}
        <label className="ml-auto flex items-center gap-1.5 text-xs text-slate-600">
          TYPE mặc định nếu thiếu
          <select
            className="rounded-md border border-mist bg-white px-2 py-1"
            value={defaultType}
            onChange={(e) => setDefaultType(e.target.value as BulkSupportedType | '')}
          >
            <option value="">Tự nhận</option>
            {BULK_SUPPORTED_TYPES.map((t) => (
              <option key={t} value={t}>
                {TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <TopicPicker
        subjectId={subjectId}
        grade={grade}
        topics={topicSource.topics}
        loaded={topicSource.loaded}
        value={defaultTopicIds}
        onChange={setDefaultTopicIds}
        onCreated={topicSource.addTopic}
        label="Chủ đề mặc định (áp dụng cho mọi câu)"
        hint="Chủ đề ghi trong TOPIC: của từng câu được cộng thêm."
      />

      <textarea
        rows={16}
        spellCheck={false}
        className="w-full rounded-md border border-mist bg-white px-3 py-2 font-mono text-xs leading-relaxed text-ink disabled:bg-slate-50 sm:text-sm"
        value={text}
        disabled={busy}
        onChange={(e) => {
          setText(e.target.value);
          setCreatedCount(0);
          setError(null);
        }}
        placeholder="Dán các khối câu hỏi, cách nhau bằng ==="
      />

      <div className="rounded-lg border border-mist/80 bg-slate-50/80 px-3 py-2">
        <p className="text-xs font-medium text-slate-600">
          Xem trước: {okItems.length} hợp lệ
          {errItems.length ? ` · ${errItems.length} lỗi` : ''}
          {!parsed.length ? ' · chưa có khối nào' : ''}
        </p>
        {parsed.length > 0 && (
          <ul className="mt-2 max-h-72 space-y-2 overflow-y-auto text-xs">
            {parsed.map((item) =>
              item.ok ? (
                <li
                  key={item.index}
                  className="rounded-md border border-emerald-100 bg-white/80 px-2.5 py-2 text-emerald-900"
                >
                  <p className="mb-1.5 font-medium text-emerald-800">
                    #{item.index + 1} · {TYPE_LABEL[item.payload.type]} · {item.payload.points}đ
                  </p>
                  <ContentBlocksView blocks={item.payload.content} compact />
                  {itemTopics(item.payload.topicNames).length > 0 && (
                    <p className="mt-1 flex flex-wrap gap-1">
                      {itemTopics(item.payload.topicNames).map((t) => (
                        <span
                          key={t.name}
                          className={`rounded-full border px-2 py-0.5 text-[11px] ${
                            t.isNew
                              ? 'border-amber-300 bg-amber-50 text-amber-800'
                              : 'border-mist bg-slate-50 text-slate-600'
                          }`}
                        >
                          {t.name}
                          {t.isNew ? ' · mới' : ''}
                        </span>
                      ))}
                    </p>
                  )}
                  {item.payload.options.length > 0 && (
                    <ul className="mt-1.5 space-y-0.5 border-t border-mist/60 pt-1.5">
                      {item.payload.options.map((o) => (
                        <li key={o.id} className="flex items-start gap-1.5 text-slate-700">
                          <span className="shrink-0 font-semibold">{o.id})</span>
                          <OptionContentView content={o.content} />
                          {item.payload.answer.type === 'single' &&
                            item.payload.answer.value === o.id && (
                              <span className="shrink-0 text-emerald-600">✓</span>
                            )}
                        </li>
                      ))}
                    </ul>
                  )}
                  {item.payload.answer.type === 'text' && (
                    <p className="mt-1.5 border-t border-mist/60 pt-1.5 text-slate-600">
                      Đáp án chấp nhận:{' '}
                      <code className="rounded bg-slate-100 px-1">
                        {item.payload.answer.value.join(' | ')}
                      </code>
                    </p>
                  )}
                </li>
              ) : (
                <li key={item.index} className="rounded-md border border-red-100 bg-red-50/50 px-2.5 py-2 text-red-700">
                  #{item.index + 1} · {item.message}
                </li>
              ),
            )}
          </ul>
        )}
      </div>

      {footerExtra}

      {error && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      {progress && <p className="text-sm text-amber-800">{progress}</p>}
      {!busy && createdCount > 0 && !error && (
        <p className="text-sm text-emerald-700">Đã tạo {createdCount} câu và gắn vào đề.</p>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy || !okItems.length || errItems.length > 0}
          onClick={() => void onCreate()}
          className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-accentDark disabled:opacity-50"
        >
          {busy
            ? 'Đang tạo…'
            : errItems.length
              ? 'Sửa lỗi trước khi tạo'
              : okItems.length
                ? `Tạo ${okItems.length} câu`
                : 'Tạo câu'}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setText(BULK_EXAMPLE_TEXT);
            setError(null);
            setCreatedCount(0);
          }}
          className="rounded-md border border-mist px-3 py-2 text-sm hover:border-accent"
        >
          Khôi phục ví dụ
        </button>
      </div>
    </div>
  );
}
