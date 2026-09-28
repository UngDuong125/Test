'use client';

import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  DIFFICULTY_OPTIONS,
  OPTION_IDS,
  QUESTION_TYPES_UI,
  isOptionBasedType,
} from '@/constants/questions';
import { SUBJECT_TAGS } from '@/constants/tags';
import { ApiError, getMedia } from '@/lib/api-client';
import { useTopics } from '@/lib/topics';
import type { TagKey } from '@/types/auth';
import type {
  ContentBlock,
  Difficulty,
  Question,
  QuestionAnswer,
  QuestionOption,
  QuestionType,
} from '@/types/content';
import { ContentBlocksEditor } from './ContentBlocksEditor';
import { TopicPicker } from './TopicPicker';
import {
  QuestionPreview,
  filterOptionBlocks,
  normalizeOptionContent,
  optionHasContent,
} from './QuestionPreview';
import { normalizeLatexInput } from '@/lib/latex';

export type FormOption = { id: string; content: ContentBlock[] };

export type QuestionFormValues = {
  type: QuestionType;
  subjectId: TagKey;
  grade: number;
  topicIds: string[];
  difficulty: Difficulty;
  content: ContentBlock[];
  options: FormOption[];
  singleAnswer: string;
  multiAnswers: string[];
  textAnswers: string;
  numericValue: string;
  numericTolerance: string;
  explanationText: string;
  explanationSteps: string;
  points: number;
  tags: string;
  bankId?: string;
};

function textOption(id: string, text: string): FormOption {
  return { id, content: [{ type: 'text', value: text }] };
}

function emptyOption(id: string): FormOption {
  return { id, content: [{ type: 'text', value: '' }] };
}

function trueFalseOptions(existing?: FormOption[]): FormOption[] {
  const a = existing?.[0];
  const b = existing?.[1];
  return [
    a && optionHasContent(a.content) ? { id: 'A', content: a.content } : textOption('A', 'Đúng'),
    b && optionHasContent(b.content) ? { id: 'B', content: b.content } : textOption('B', 'Sai'),
  ];
}

export function questionToFormValues(q: Question): QuestionFormValues {
  const options = q.options.map((o) => ({
    id: o.id,
    content: normalizeOptionContent(o.content),
  }));
  while (options.length < 2) {
    options.push(emptyOption(OPTION_IDS[options.length]!));
  }

  return {
    type: q.type,
    subjectId: q.subjectId,
    grade: q.grade,
    topicIds: q.topicIds,
    difficulty: q.difficulty,
    content: q.content.length ? q.content : [{ type: 'text', value: '' }],
    options: q.type === 'true_false' ? trueFalseOptions(options) : options.slice(0, 6),
    singleAnswer: q.answer.type === 'single' ? q.answer.value : 'A',
    multiAnswers: q.answer.type === 'multiple' ? q.answer.value : [],
    textAnswers: q.answer.type === 'text' ? q.answer.value.join('\n') : '',
    numericValue: q.answer.type === 'numeric' ? String(q.answer.value) : '',
    numericTolerance:
      q.answer.type === 'numeric' && q.answer.tolerance != null
        ? String(q.answer.tolerance)
        : '',
    explanationText: q.explanation?.text ?? '',
    explanationSteps: (q.explanation?.steps ?? []).join('\n'),
    points: q.points,
    tags: (q.tags ?? []).join(', '),
  };
}

export function emptyFormValues(): QuestionFormValues {
  return {
    type: 'multiple_choice',
    subjectId: 'math',
    grade: 7,
    topicIds: [],
    difficulty: 'medium',
    content: [{ type: 'text', value: '' }],
    options: [emptyOption('A'), emptyOption('B'), emptyOption('C'), emptyOption('D')],
    singleAnswer: 'A',
    multiAnswers: [],
    textAnswers: '',
    numericValue: '',
    numericTolerance: '',
    explanationText: '',
    explanationSteps: '',
    points: 1,
    tags: '',
  };
}

function buildPayload(values: QuestionFormValues): {
  type: QuestionType;
  subjectId: TagKey;
  grade: number;
  topicIds: string[];
  difficulty: Difficulty;
  content: ContentBlock[];
  options: QuestionOption[];
  answer: QuestionAnswer;
  explanation: { text?: string; steps?: string[] };
  points: number;
  tags: string[];
  bankId?: string;
} {
  const content = values.content
    .filter((b) => {
      if (b.type === 'image') return Boolean(b.mediaId);
      return b.value.trim().length > 0;
    })
    .map((b) =>
      b.type === 'latex' ? { ...b, value: normalizeLatexInput(b.value) } : b,
    );

  let options: QuestionOption[] = [];
  if (isOptionBasedType(values.type)) {
    const source =
      values.type === 'true_false'
        ? trueFalseOptions(values.options)
        : values.options.filter((o) => optionHasContent(o.content));
    options = source.map((o, i) => ({
      id: o.id,
      content: filterOptionBlocks(o.content).map((b) =>
        b.type === 'latex' ? { ...b, value: normalizeLatexInput(b.value) } : b,
      ),
      order: i + 1,
    }));
  }

  let answer: QuestionAnswer;
  switch (values.type) {
    case 'multiple_choice':
    case 'true_false':
      answer = { type: 'single', value: values.singleAnswer };
      break;
    case 'multiple_select':
      answer = { type: 'multiple', value: values.multiAnswers };
      break;
    case 'fill_blank':
    case 'short_answer':
      answer = {
        type: 'text',
        value: values.textAnswers
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean),
      };
      break;
    case 'numeric':
      answer = {
        type: 'numeric',
        value: Number(values.numericValue),
        ...(values.numericTolerance.trim()
          ? { tolerance: Number(values.numericTolerance) }
          : {}),
      };
      break;
    case 'essay':
    default:
      answer = { type: 'manual' };
      break;
  }

  const steps = values.explanationSteps
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
  const explanation: { text?: string; steps?: string[] } = {};
  if (values.explanationText.trim()) explanation.text = values.explanationText.trim();
  if (steps.length) explanation.steps = steps;

  const tags = values.tags
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);

  return {
    type: values.type,
    subjectId: values.subjectId,
    grade: values.grade,
    topicIds: values.topicIds,
    difficulty: values.difficulty,
    content,
    options,
    answer,
    explanation,
    points: values.points,
    tags,
    ...(values.bankId ? { bankId: values.bankId } : {}),
  };
}

type Props = {
  initial?: Question;
  bankId?: string;
  /** Lock môn/lớp to exam (composer). */
  lockTaxonomy?: boolean;
  defaultSubjectId?: TagKey;
  defaultGrade?: number;
  submitLabel?: string;
  onSubmit: (payload: ReturnType<typeof buildPayload>) => Promise<void>;
  /** Gắn câu rồi giữ form mở / reset để tạo câu tiếp. */
  secondarySubmitLabel?: string;
  onSecondarySubmit?: (payload: ReturnType<typeof buildPayload>) => Promise<void>;
  /** Gọi sau khi secondary submit thành công (vd. scroll tới editor). */
  onAfterContinue?: () => void;
  onCancel?: () => void;
  /** Extra footer content (e.g. save-to-bank checkbox controlled outside). */
  footerExtra?: ReactNode;
  /** Ẩn tiêu đề khung meta (composer tự có heading). */
  hideHeader?: boolean;
};

export function QuestionForm({
  initial,
  bankId,
  lockTaxonomy,
  defaultSubjectId,
  defaultGrade,
  submitLabel = 'Lưu draft',
  onSubmit,
  secondarySubmitLabel,
  onSecondarySubmit,
  onAfterContinue,
  onCancel,
  footerExtra,
  hideHeader,
}: Props) {
  const [values, setValues] = useState<QuestionFormValues>(() => {
    if (initial) return { ...questionToFormValues(initial), bankId };
    const base = { ...emptyFormValues(), bankId };
    if (defaultSubjectId) base.subjectId = defaultSubjectId;
    if (defaultGrade != null) base.grade = defaultGrade;
    return base;
  });
  const topicSource = useTopics(values.subjectId, values.grade);
  const onTopicIdsChange = useCallback(
    (topicIds: string[]) => setValues((v) => ({ ...v, topicIds })),
    [],
  );
  const [mediaUrls, setMediaUrls] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [busyMode, setBusyMode] = useState<'primary' | 'secondary' | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const formTopRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const imageIds = [
      ...values.content,
      ...values.options.flatMap((o) => o.content),
    ]
      .filter((b): b is Extract<ContentBlock, { type: 'image' }> => b.type === 'image')
      .map((b) => b.mediaId)
      .filter((id) => !mediaUrls[id]);
    if (!imageIds.length) return;
    let cancelled = false;
    void Promise.all(
      imageIds.map(async (id) => {
        try {
          const res = await getMedia(id);
          return [id, res.media.url] as const;
        } catch {
          return null;
        }
      }),
    ).then((pairs) => {
      if (cancelled) return;
      setMediaUrls((prev) => {
        const next = { ...prev };
        for (const pair of pairs) {
          if (pair) next[pair[0]] = pair[1];
        }
        return next;
      });
    });
    return () => {
      cancelled = true;
    };
    // Only resolve missing media when content/option image ids change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values.content, values.options]);

  function setType(type: QuestionType) {
    setValues((v) => {
      const next = { ...v, type };
      if (type === 'true_false') {
        next.options = trueFalseOptions(v.options);
        next.singleAnswer = 'A';
      } else if (type === 'multiple_choice' || type === 'multiple_select') {
        if (v.options.length < 2) {
          next.options = [emptyOption('A'), emptyOption('B'), emptyOption('C'), emptyOption('D')];
        }
      }
      return next;
    });
  }

  const previewPayload = useMemo(() => {
    try {
      return buildPayload(values);
    } catch {
      return null;
    }
  }, [values]);

  function resetForNextQuestion() {
    const next = emptyFormValues();
    next.subjectId = defaultSubjectId ?? values.subjectId;
    next.grade = defaultGrade ?? values.grade;
    next.bankId = bankId ?? values.bankId;
    next.type = values.type;
    next.difficulty = values.difficulty;
    if (next.subjectId === values.subjectId && next.grade === values.grade) {
      next.topicIds = values.topicIds;
    }
    if (next.type === 'true_false') {
      next.options = trueFalseOptions();
    }
    setValues(next);
    setShowPreview(false);
    setError(null);
    setMediaUrls({});
  }

  async function runSubmit(
    mode: 'primary' | 'secondary',
    handler: (payload: ReturnType<typeof buildPayload>) => Promise<void>,
  ) {
    setError(null);
    setBusy(true);
    setBusyMode(mode);
    try {
      const payload = buildPayload(values);
      if (!payload.content.length) {
        throw new Error('Cần ít nhất một khối nội dung (text/LaTeX/ảnh)');
      }
      if (isOptionBasedType(values.type) && payload.options.length < 2) {
        throw new Error('Cần ít nhất 2 phương án có nội dung');
      }
      if (values.type === 'multiple_select' && values.multiAnswers.length === 0) {
        throw new Error('Hãy đánh dấu ít nhất một đáp án đúng');
      }
      if (
        (values.type === 'multiple_choice' || values.type === 'true_false') &&
        !payload.options.some((o) => o.id === values.singleAnswer)
      ) {
        throw new Error('Hãy đánh dấu đáp án đúng bên cạnh phương án');
      }
      await handler(payload);
      if (mode === 'secondary') {
        resetForNextQuestion();
        onAfterContinue?.();
        requestAnimationFrame(() => {
          formTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
      }
    } catch (err) {
      setError(err instanceof ApiError || err instanceof Error ? err.message : 'Lưu thất bại');
    } finally {
      setBusy(false);
      setBusyMode(null);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    await runSubmit('primary', onSubmit);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div ref={formTopRef} />
      {error && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="grid gap-3 rounded-xl border border-mist bg-white/90 p-4 shadow-sm sm:grid-cols-2 sm:p-5">
        {!hideHeader && (
          <h2 className="sm:col-span-2 font-semibold text-ink">
            {initial ? 'Chỉnh sửa câu hỏi' : 'Tạo câu hỏi'}
          </h2>
        )}

        <label className="text-sm">
          Loại
          <select
            className="mt-1 w-full rounded-md border border-mist px-3 py-2"
            value={values.type}
            onChange={(e) => setType(e.target.value as QuestionType)}
          >
            {QUESTION_TYPES_UI.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </label>

        <label className="text-sm">
          Độ khó
          <select
            className="mt-1 w-full rounded-md border border-mist px-3 py-2"
            value={values.difficulty}
            onChange={(e) =>
              setValues({ ...values, difficulty: e.target.value as Difficulty })
            }
          >
            {DIFFICULTY_OPTIONS.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </select>
        </label>

        <label className="text-sm">
          Môn
          <select
            disabled={lockTaxonomy}
            className="mt-1 w-full rounded-md border border-mist px-3 py-2 disabled:bg-slate-50"
            value={values.subjectId}
            onChange={(e) =>
              setValues({
                ...values,
                subjectId: e.target.value as TagKey,
                topicIds: [],
              })
            }
          >
            {SUBJECT_TAGS.map((t) => (
              <option key={t.key} value={t.key}>
                {t.label}
              </option>
            ))}
          </select>
        </label>

        <label className="text-sm">
          Lớp
          <input
            type="number"
            min={6}
            max={9}
            disabled={lockTaxonomy}
            className="mt-1 w-full rounded-md border border-mist px-3 py-2 disabled:bg-slate-50"
            value={values.grade}
            onChange={(e) => setValues({ ...values, grade: Number(e.target.value) })}
          />
        </label>

        <div className="sm:col-span-2">
          <TopicPicker
            subjectId={values.subjectId}
            grade={values.grade}
            topics={topicSource.topics}
            loaded={topicSource.loaded}
            value={values.topicIds}
            onChange={onTopicIdsChange}
            onCreated={topicSource.addTopic}
          />
        </div>

        <label className="text-sm">
          Điểm
          <input
            type="number"
            min={0.25}
            step={0.25}
            required
            className="mt-1 w-full rounded-md border border-mist px-3 py-2"
            value={values.points}
            onChange={(e) => setValues({ ...values, points: Number(e.target.value) })}
          />
        </label>

        <label className="text-sm">
          Tags (phẩy)
          <input
            className="mt-1 w-full rounded-md border border-mist px-3 py-2"
            value={values.tags}
            onChange={(e) => setValues({ ...values, tags: e.target.value })}
            placeholder="algebra, linear"
          />
        </label>
      </div>

      <div className="rounded-xl border border-mist bg-white/90 p-5 shadow-sm">
        <h3 className="mb-3 font-semibold text-ink">Nội dung (text / LaTeX / ảnh)</h3>
        <ContentBlocksEditor
          blocks={values.content}
          onChange={(content) => setValues({ ...values, content })}
          mediaUrls={mediaUrls}
          onMediaUrl={(id, url) => setMediaUrls((m) => ({ ...m, [id]: url }))}
        />
      </div>

      {isOptionBasedType(values.type) && (
        <div className="space-y-3 rounded-xl border border-mist bg-white/90 p-5 shadow-sm">
          <div>
            <h3 className="font-semibold text-ink">Phương án</h3>
            <p className="mt-1 text-xs text-slate-500">
              Mỗi phương án hỗ trợ text / LaTeX / ảnh. Đánh dấu đáp án đúng ngay bên cạnh.
              {values.type === 'multiple_select'
                ? ' Có thể chọn nhiều đáp án.'
                : ' Chỉ chọn một đáp án.'}
            </p>
          </div>
          {values.options.map((opt) => {
            const multi = values.type === 'multiple_select';
            const isCorrect = multi
              ? values.multiAnswers.includes(opt.id)
              : values.singleAnswer === opt.id;

            return (
              <div
                key={opt.id}
                className={`space-y-2 rounded-lg border p-3 ${
                  isCorrect
                    ? 'border-accent bg-accent/5'
                    : 'border-mist/80 bg-paper/40'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium text-ink">Option {opt.id}</p>
                  <label
                    className={`inline-flex cursor-pointer items-center gap-2 rounded-md border px-2.5 py-1 text-xs font-medium ${
                      isCorrect
                        ? 'border-accent bg-white text-accentDark'
                        : 'border-mist bg-white text-slate-600 hover:border-accent'
                    }`}
                  >
                    <input
                      type={multi ? 'checkbox' : 'radio'}
                      name={multi ? undefined : 'correct-answer'}
                      className="accent-accent"
                      checked={isCorrect}
                      onChange={() => {
                        if (multi) {
                          const multiAnswers = isCorrect
                            ? values.multiAnswers.filter((id) => id !== opt.id)
                            : [...values.multiAnswers, opt.id];
                          setValues({ ...values, multiAnswers });
                        } else {
                          setValues({ ...values, singleAnswer: opt.id });
                        }
                      }}
                    />
                    {isCorrect ? 'Đáp án đúng' : 'Đánh dấu đúng'}
                  </label>
                </div>
                <ContentBlocksEditor
                  compact
                  blocks={opt.content}
                  onChange={(content) => {
                    const options = values.options.map((o) =>
                      o.id === opt.id ? { ...o, content } : o,
                    );
                    setValues({ ...values, options });
                  }}
                  mediaUrls={mediaUrls}
                  onMediaUrl={(id, url) => setMediaUrls((m) => ({ ...m, [id]: url }))}
                />
              </div>
            );
          })}
          {values.type !== 'true_false' && values.options.length < 6 && (
            <button
              type="button"
              className="rounded-md border border-mist px-3 py-1.5 text-sm hover:border-accent"
              onClick={() => {
                const id = OPTION_IDS[values.options.length];
                if (!id) return;
                setValues({
                  ...values,
                  options: [...values.options, emptyOption(id)],
                });
              }}
            >
              + Thêm option
            </button>
          )}
        </div>
      )}

      {(values.type === 'fill_blank' || values.type === 'short_answer') && (
        <div className="rounded-xl border border-mist bg-white/90 p-5 shadow-sm">
          <label className="block text-sm">
            Đáp án chấp nhận (mỗi dòng một biến thể)
            <textarea
              required
              rows={3}
              className="mt-1 w-full rounded-md border border-mist px-3 py-2"
              value={values.textAnswers}
              onChange={(e) => setValues({ ...values, textAnswers: e.target.value })}
            />
          </label>
        </div>
      )}

      {values.type === 'numeric' && (
        <div className="grid gap-3 rounded-xl border border-mist bg-white/90 p-5 shadow-sm sm:grid-cols-2">
          <label className="text-sm">
            Giá trị số
            <input
              required
              type="number"
              step="any"
              className="mt-1 w-full rounded-md border border-mist px-3 py-2"
              value={values.numericValue}
              onChange={(e) => setValues({ ...values, numericValue: e.target.value })}
            />
          </label>
          <label className="text-sm">
            Sai số (tolerance)
            <input
              type="number"
              step="any"
              min={0}
              className="mt-1 w-full rounded-md border border-mist px-3 py-2"
              value={values.numericTolerance}
              onChange={(e) => setValues({ ...values, numericTolerance: e.target.value })}
            />
          </label>
        </div>
      )}

      {values.type === 'essay' && (
        <p className="rounded-md border border-mist bg-paper px-3 py-2 text-sm text-slate-600">
          Tự luận dùng chấm thủ công (`answer.type = manual`).
        </p>
      )}

      <div className="grid gap-3 rounded-xl border border-mist bg-white/90 p-5 shadow-sm">
        <h3 className="font-semibold text-ink">Lời giải</h3>
        <label className="text-sm">
          Giải thích
          <textarea
            rows={2}
            className="mt-1 w-full rounded-md border border-mist px-3 py-2"
            value={values.explanationText}
            onChange={(e) => setValues({ ...values, explanationText: e.target.value })}
          />
        </label>
        <label className="text-sm">
          Các bước (mỗi dòng một bước)
          <textarea
            rows={3}
            className="mt-1 w-full rounded-md border border-mist px-3 py-2"
            value={values.explanationSteps}
            onChange={(e) => setValues({ ...values, explanationSteps: e.target.value })}
          />
        </label>
      </div>

      {footerExtra}

      <div className="sticky bottom-0 z-10 -mx-1 flex flex-wrap items-center gap-2 border-t border-mist/80 bg-paper/95 px-1 py-3 backdrop-blur">
        <button
          type="button"
          className="rounded-md border border-mist px-3 py-2 text-sm hover:border-accent"
          onClick={() => setShowPreview((p) => !p)}
        >
          {showPreview ? 'Ẩn preview' : 'Preview'}
        </button>
        {onCancel && (
          <button
            type="button"
            className="rounded-md border border-mist px-3 py-2 text-sm hover:border-accent"
            onClick={onCancel}
          >
            Hủy
          </button>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {onSecondarySubmit && secondarySubmitLabel && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void runSubmit('secondary', onSecondarySubmit)}
              className="rounded-md border border-accent bg-teal-50 px-3 py-2 text-sm font-medium text-accentDark hover:bg-teal-100 disabled:opacity-60"
            >
              {busyMode === 'secondary' ? 'Đang gắn…' : secondarySubmitLabel}
            </button>
          )}
          <button
            type="submit"
            disabled={busy}
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accentDark disabled:opacity-60"
          >
            {busyMode === 'primary' ? 'Đang lưu…' : submitLabel}
          </button>
        </div>
      </div>

      {showPreview && previewPayload && (
        <div>
          <p className="mb-2 text-sm font-medium text-ink">Xem trước trước khi lưu / publish</p>
          <QuestionPreview
            content={previewPayload.content}
            options={previewPayload.options}
            answer={previewPayload.answer}
            explanation={previewPayload.explanation}
          />
        </div>
      )}
    </form>
  );
}
