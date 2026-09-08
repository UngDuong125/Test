'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { SUBJECT_TAGS } from '@/constants/tags';
import { BulkQuestionTextImport } from '@/components/exams/BulkQuestionTextImport';
import { QuestionForm } from '@/components/questions/QuestionForm';
import { QuestionPreview } from '@/components/questions/QuestionPreview';
import {
  ApiError,
  addExamQuestions,
  addExamSection,
  createExamQuestion,
  listQuestionBanks,
  listQuestions,
  publishExam,
  removeExamQuestion,
  updateExam,
  updateExamQuestion,
  validateExam,
} from '@/lib/api-client';
import type { BulkQuestionPayload } from '@/lib/bulk-question-text';
import type { TagKey } from '@/types/auth';
import type {
  Exam,
  ExamQuestion,
  ExamSection,
  ExamType,
  Question,
  QuestionBank,
} from '@/types/content';

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';
type RightTab = 'bank' | 'create' | 'bulk';

type Props = {
  initialExam: Exam;
  initialSections: ExamSection[];
  initialQuestions: ExamQuestion[];
  initialQuestionDetails: Question[];
};

const EXAM_TYPES: ExamType[] = [
  'practice',
  'quiz',
  'homework',
  'worksheet',
  'midterm',
  'final',
];

const TYPE_LABEL: Record<string, string> = {
  multiple_choice: 'TN',
  true_false: 'Đ/S',
  fill_blank: 'Điền',
  short_answer: 'Ngắn',
  essay: 'TL',
  multiple_select: 'Nhiều ĐA',
  numeric: 'Số',
};

function snippet(q: Question | undefined): string {
  if (!q?.content?.length) return '(chưa có nội dung)';
  const first = q.content[0];
  if (first?.type === 'image') return '[Ảnh]';
  if (first && 'value' in first) {
    const t = String(first.value).trim();
    return t.length > 72 ? `${t.slice(0, 72)}…` : t || '(chưa có nội dung)';
  }
  return '(chưa có nội dung)';
}

export function ExamComposer({
  initialExam,
  initialSections,
  initialQuestions,
  initialQuestionDetails,
}: Props) {
  const router = useRouter();
  const editorRef = useRef<HTMLDivElement>(null);
  const [exam, setExam] = useState(initialExam);
  const [sections, setSections] = useState(initialSections);
  const [examQuestions, setExamQuestions] = useState(initialQuestions);
  const [questionMap, setQuestionMap] = useState<Record<string, Question>>(() => {
    const map: Record<string, Question> = {};
    for (const q of initialQuestionDetails) map[q.id] = q;
    return map;
  });

  const [meta, setMeta] = useState({
    title: initialExam.title,
    description: initialExam.description,
    subjectId: initialExam.subjectId,
    grade: initialExam.grade,
    type: initialExam.type,
    difficulty: initialExam.difficulty,
    duration: initialExam.duration,
    totalPoints: initialExam.totalPoints,
    instructions: initialExam.instructions,
  });

  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [rightTab, setRightTab] = useState<RightTab | null>(
    initialExam.status === 'draft' ? 'bank' : null,
  );
  const [banks, setBanks] = useState<QuestionBank[]>([]);
  const [selectedBankId, setSelectedBankId] = useState('');
  const [saveToBank, setSaveToBank] = useState(true);
  const [bankPool, setBankPool] = useState<Question[]>([]);
  const [bankLoading, setBankLoading] = useState(false);
  const [validation, setValidation] = useState<Awaited<ReturnType<typeof validateExam>> | null>(
    null,
  );
  const [publishing, setPublishing] = useState(false);
  const [formNonce, setFormNonce] = useState(0);

  const editable = exam.status === 'draft';
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const metaRef = useRef(meta);
  metaRef.current = meta;

  const sumPoints = useMemo(
    () => examQuestions.reduce((acc, eq) => acc + eq.points, 0),
    [examQuestions],
  );

  const pointsMatch =
    meta.totalPoints === 0 || Math.abs(sumPoints - meta.totalPoints) <= 0.001;

  const sortedQuestions = useMemo(
    () => [...examQuestions].sort((a, b) => a.order - b.order),
    [examQuestions],
  );

  function showFlash(message: string) {
    setFlash(message);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(null), 2800);
  }

  function scrollToEditor() {
    requestAnimationFrame(() => {
      editorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  function openCreateTab() {
    setRightTab('create');
    setError(null);
    scrollToEditor();
  }

  function openBulkTab() {
    setRightTab('bulk');
    setError(null);
    scrollToEditor();
  }

  const bankFooter = (
    <label className="flex flex-wrap items-center gap-2 rounded-md border border-mist bg-slate-50/80 px-3 py-2 text-sm text-slate-700">
      <input
        type="checkbox"
        checked={saveToBank && Boolean(selectedBankId)}
        disabled={!selectedBankId}
        onChange={(e) => setSaveToBank(e.target.checked)}
      />
      Lưu vào ngân hàng
      {selectedBankId ? (
        <select
          className="rounded-md border border-mist bg-white px-2 py-1 text-sm"
          value={selectedBankId}
          onChange={(e) => setSelectedBankId(e.target.value)}
        >
          {banks.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      ) : (
        <span className="text-xs text-amber-700">Chưa có bank môn/lớp này</span>
      )}
    </label>
  );

  const persistMeta = useCallback(async () => {
    if (!editable) return;
    setSaveStatus('saving');
    try {
      const m = metaRef.current;
      const { exam: updated } = await updateExam(exam.id, {
        title: m.title,
        description: m.description,
        subjectId: m.subjectId,
        grade: m.grade,
        type: m.type,
        difficulty: m.difficulty,
        duration: m.duration,
        totalPoints: m.totalPoints,
        instructions: m.instructions,
      });
      setExam(updated);
      setSaveStatus('saved');
    } catch (err) {
      setSaveStatus('error');
      setError(err instanceof ApiError ? err.message : 'Autosave thất bại');
    }
  }, [editable, exam.id]);

  function scheduleAutosave() {
    if (!editable) return;
    setSaveStatus('saving');
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void persistMeta();
    }, 700);
  }

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (flashTimer.current) clearTimeout(flashTimer.current);
    };
  }, []);

  useEffect(() => {
    void listQuestionBanks({ subjectId: meta.subjectId, grade: meta.grade }).then((res) => {
      setBanks(res.items);
      if (!selectedBankId && res.items[0]) {
        setSelectedBankId(res.items[0].id);
      }
    });
  }, [meta.subjectId, meta.grade, selectedBankId]);

  async function loadBankPool() {
    setError(null);
    setBankLoading(true);
    try {
      const params: Record<string, string | number | undefined> = {
        subjectId: meta.subjectId,
        grade: meta.grade,
        status: 'published',
        limit: 50,
      };
      if (selectedBankId) params.bankId = selectedBankId;
      const res = await listQuestions(params);
      const onExam = new Set(examQuestions.map((eq) => eq.questionId));
      setBankPool(res.items.filter((q) => !onExam.has(q.id)));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Không tải được ngân hàng');
    } finally {
      setBankLoading(false);
    }
  }

  useEffect(() => {
    if (rightTab === 'bank' && editable) void loadBankPool();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rightTab, selectedBankId]);

  async function ensureDefaultSection(): Promise<string | null> {
    if (sections[0]) return sections[0].id;
    const { section } = await addExamSection(exam.id, {
      title: 'Phần 1',
      description: '',
    });
    setSections([section]);
    return section.id;
  }

  async function refreshLocalFromAdd(eqs: ExamQuestion[], details: Question[]) {
    setExamQuestions((prev) => {
      const map = new Map(prev.map((e) => [e.questionId, e]));
      for (const eq of eqs) map.set(eq.questionId, eq);
      return [...map.values()].sort((a, b) => a.order - b.order);
    });
    setQuestionMap((prev) => {
      const next = { ...prev };
      for (const q of details) next[q.id] = q;
      return next;
    });
  }

  async function onAddFromBank(questionId: string) {
    if (!editable) return;
    setError(null);
    try {
      const sectionId = await ensureDefaultSection();
      const res = await addExamQuestions(exam.id, {
        questionIds: [questionId],
        sectionId,
      });
      await refreshLocalFromAdd(res.questions, res.questionDetails);
      setBankPool((prev) => prev.filter((q) => q.id !== questionId));
      showFlash('Đã thêm câu từ ngân hàng vào đề');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Thêm câu thất bại');
    }
  }

  async function attachCreatedQuestion(payload: Record<string, unknown>) {
    if (!editable) return;
    setError(null);
    const sectionId = await ensureDefaultSection();
    const body = {
      ...payload,
      subjectId: meta.subjectId,
      grade: meta.grade,
      sectionId,
      ...(saveToBank && selectedBankId ? { bankId: selectedBankId } : {}),
    };
    const res = await createExamQuestion(exam.id, body);
    await refreshLocalFromAdd([res.examQuestion], [res.question]);
    return res;
  }

  async function onCreateAndClose(payload: Record<string, unknown>) {
    await attachCreatedQuestion(payload);
    showFlash('Đã gắn câu vào đề');
    setRightTab('bank');
  }

  async function onCreateAndContinue(payload: Record<string, unknown>) {
    await attachCreatedQuestion(payload);
    showFlash('Đã gắn câu — tiếp tục tạo câu mới');
    setRightTab('create');
    setFormNonce((n) => n + 1);
  }

  async function onBulkCreateOne(payload: BulkQuestionPayload) {
    await attachCreatedQuestion(payload as unknown as Record<string, unknown>);
  }

  async function onChangePoints(questionId: string, points: number) {
    if (!editable || !(points > 0)) return;
    setError(null);
    try {
      const { question } = await updateExamQuestion(exam.id, questionId, { points });
      setExamQuestions((prev) =>
        prev.map((eq) => (eq.questionId === questionId ? question : eq)),
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Cập nhật điểm thất bại');
    }
  }

  async function onRemove(questionId: string) {
    if (!editable) return;
    if (!confirm('Bỏ câu khỏi đề? Câu hỏi vẫn còn trong hệ thống (không bị xóa).')) return;
    setError(null);
    try {
      await removeExamQuestion(exam.id, questionId);
      setExamQuestions((prev) => prev.filter((eq) => eq.questionId !== questionId));
      showFlash('Đã bỏ câu khỏi đề');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Bỏ câu thất bại');
    }
  }

  async function onValidateAndPublish() {
    if (!editable) return;
    setError(null);
    setPublishing(true);
    try {
      await persistMeta();
      const result = await validateExam(exam.id);
      setValidation(result);

      if (!result.ok) {
        setError(result.errors.map((e) => e.message).join(' · ') || 'Validation thất bại');
        return;
      }

      const hasDrafts = result.draftQuestionIds.length > 0;
      if (hasDrafts) {
        const ok = confirm(
          `Có ${result.draftQuestionIds.length} câu draft/review trên đề. Xuất bản các câu hợp lệ cùng với đề?`,
        );
        if (!ok) return;
      }

      const detail = await publishExam(exam.id, {
        publishDraftQuestions: hasDrafts,
      });
      setExam(detail.exam);
      setSections(detail.sections);
      setExamQuestions(detail.questions);
      const map: Record<string, Question> = {};
      for (const q of detail.questionDetails) map[q.id] = q;
      setQuestionMap(map);
      setRightTab(null);
      showFlash('Đã xuất bản đề');
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Publish thất bại');
    } finally {
      setPublishing(false);
    }
  }

  const saveLabel =
    saveStatus === 'saving'
      ? 'Đang lưu…'
      : saveStatus === 'saved'
        ? 'Đã lưu'
        : saveStatus === 'error'
          ? 'Có lỗi'
          : '';

  const fieldClass =
    'mt-1 w-full rounded-md border border-mist bg-white px-2.5 py-1.5 text-sm disabled:bg-slate-50';

  return (
    <div className="mx-auto max-w-7xl space-y-4 px-4 pb-10 pt-5">
      <header className="sticky top-0 z-20 -mx-4 border-b border-mist/70 bg-paper/90 px-4 py-3 backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-display text-xl font-bold text-ink sm:text-2xl">Trình soạn đề</h1>
              <span className="rounded border border-mist px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                {exam.status}
              </span>
              {saveLabel && (
                <span
                  className={
                    saveStatus === 'error'
                      ? 'text-xs text-red-600'
                      : saveStatus === 'saving'
                        ? 'text-xs text-amber-700'
                        : 'text-xs text-emerald-700'
                  }
                >
                  {saveLabel}
                </span>
              )}
            </div>
            <p className="mt-0.5 truncate text-sm text-slate-600">{meta.title || 'Chưa đặt tên'}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Link
              href="/exams"
              className="rounded-md border border-mist px-3 py-1.5 text-slate-600 hover:border-accent hover:text-accentDark"
            >
              Danh sách
            </Link>
            <button
              type="button"
              onClick={() => setShowPreview((v) => !v)}
              className="rounded-md border border-mist px-3 py-1.5 hover:border-accent"
            >
              {showPreview ? 'Ẩn preview' : 'Preview đề'}
            </button>
            {editable && (
              <>
                <button
                  type="button"
                  onClick={openCreateTab}
                  className="rounded-md border border-accent px-3 py-1.5 font-medium text-accentDark hover:bg-teal-50"
                >
                  + Tạo câu mới
                </button>
                <button
                  type="button"
                  onClick={openBulkTab}
                  className="rounded-md border border-mist px-3 py-1.5 font-medium text-slate-700 hover:border-accent"
                >
                  Dán text
                </button>
                <button
                  type="button"
                  disabled={publishing}
                  onClick={() => void onValidateAndPublish()}
                  className="rounded-md bg-accent px-3 py-1.5 font-medium text-white hover:bg-accentDark disabled:opacity-60"
                >
                  {publishing ? 'Đang xuất bản…' : 'Xuất bản'}
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      {flash && (
        <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {flash}
        </p>
      )}
      {error && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      {validation && validation.warnings.length > 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {validation.warnings.map((w) => (
            <p key={`${w.code}-${w.questionId ?? ''}`}>{w.message}</p>
          ))}
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[240px_minmax(0,1fr)_300px]">
        {/* Meta */}
        <aside className="h-fit space-y-2.5 rounded-xl border border-mist bg-white/90 p-3.5 shadow-sm xl:sticky xl:top-[4.5rem]">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Thông tin đề
          </h2>
          <label className="block text-xs font-medium text-slate-600">
            Tên đề
            <input
              disabled={!editable}
              className={fieldClass}
              value={meta.title}
              onChange={(e) => {
                setMeta({ ...meta, title: e.target.value });
                scheduleAutosave();
              }}
            />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block text-xs font-medium text-slate-600">
              Môn
              <select
                disabled={!editable}
                className={fieldClass}
                value={meta.subjectId}
                onChange={(e) => {
                  setMeta({ ...meta, subjectId: e.target.value as TagKey });
                  scheduleAutosave();
                }}
              >
                {SUBJECT_TAGS.map((t) => (
                  <option key={t.key} value={t.key}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs font-medium text-slate-600">
              Lớp
              <input
                type="number"
                min={6}
                max={9}
                disabled={!editable}
                className={fieldClass}
                value={meta.grade}
                onChange={(e) => {
                  setMeta({ ...meta, grade: Number(e.target.value) });
                  scheduleAutosave();
                }}
              />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="block text-xs font-medium text-slate-600">
              Loại
              <select
                disabled={!editable}
                className={fieldClass}
                value={meta.type}
                onChange={(e) => {
                  setMeta({ ...meta, type: e.target.value as ExamType });
                  scheduleAutosave();
                }}
              >
                {EXAM_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs font-medium text-slate-600">
              Phút (0 = không giới hạn)
              <input
                type="number"
                min={0}
                max={600}
                disabled={!editable}
                className={fieldClass}
                value={meta.duration}
                onChange={(e) => {
                  setMeta({ ...meta, duration: Number(e.target.value) });
                  scheduleAutosave();
                }}
              />
            </label>
          </div>
          <label className="block text-xs font-medium text-slate-600">
            Tổng điểm đề
            <input
              type="number"
              min={0}
              step={0.5}
              disabled={!editable}
              className={fieldClass}
              value={meta.totalPoints}
              onChange={(e) => {
                setMeta({ ...meta, totalPoints: Number(e.target.value) });
                scheduleAutosave();
              }}
            />
            <span
              className={`mt-1 block text-[11px] ${pointsMatch ? 'text-slate-500' : 'text-amber-700'}`}
            >
              Σ câu: {sumPoints}
              {!pointsMatch ? ' · chưa khớp tổng điểm' : ''}
            </span>
          </label>
          <label className="block text-xs font-medium text-slate-600">
            Hướng dẫn
            <textarea
              rows={3}
              disabled={!editable}
              className={fieldClass}
              value={meta.instructions}
              onChange={(e) => {
                setMeta({ ...meta, instructions: e.target.value });
                scheduleAutosave();
              }}
            />
          </label>
        </aside>

        {/* Question list + optional preview / create editor */}
        <div className="space-y-4">
          <section className="rounded-xl border border-mist bg-white/90 p-4 shadow-sm">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="font-semibold text-ink">Câu trên đề</h2>
                <p className="text-xs text-slate-500">
                  {examQuestions.length} câu
                  {sections[0] ? ` · ${sections.map((s) => s.title).join(', ')}` : ''}
                </p>
              </div>
              {editable && (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setRightTab('bank')}
                    className="rounded-md border border-mist px-2.5 py-1 text-xs hover:border-accent sm:text-sm sm:px-3 sm:py-1.5"
                  >
                    Ngân hàng
                  </button>
                  <button
                    type="button"
                    onClick={openCreateTab}
                    className="rounded-md bg-accent px-2.5 py-1 text-xs text-white hover:bg-accentDark sm:text-sm sm:px-3 sm:py-1.5"
                  >
                    Tạo câu mới
                  </button>
                  <button
                    type="button"
                    onClick={openBulkTab}
                    className="rounded-md border border-mist px-2.5 py-1 text-xs hover:border-accent sm:text-sm sm:px-3 sm:py-1.5"
                  >
                    Dán text
                  </button>
                </div>
              )}
            </div>

            <ul className="divide-y divide-mist/80">
              {sortedQuestions.map((eq) => {
                const q = questionMap[eq.questionId];
                return (
                  <li key={eq.questionId} className="flex flex-wrap items-center gap-2 py-2.5 first:pt-0 last:pb-0">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-slate-100 text-xs font-semibold text-slate-600">
                      {eq.order}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-ink">{snippet(q)}</p>
                      <p className="text-[11px] text-slate-500">
                        {TYPE_LABEL[q?.type ?? ''] ?? q?.type ?? '?'} · {q?.difficulty ?? '?'} ·{' '}
                        <span
                          className={
                            q?.status === 'published'
                              ? 'text-emerald-700'
                              : q?.status === 'draft'
                                ? 'text-amber-700'
                                : ''
                          }
                        >
                          {q?.status ?? '?'}
                        </span>
                      </p>
                    </div>
                    <label className="flex items-center gap-1 text-xs text-slate-600">
                      <span className="sr-only sm:not-sr-only">Điểm</span>
                      <input
                        type="number"
                        min={0.1}
                        step={0.1}
                        disabled={!editable}
                        className="w-14 rounded border border-mist px-1.5 py-1 text-sm disabled:bg-slate-50"
                        value={eq.points}
                        onChange={(e) => {
                          const points = Number(e.target.value);
                          setExamQuestions((prev) =>
                            prev.map((row) =>
                              row.questionId === eq.questionId ? { ...row, points } : row,
                            ),
                          );
                        }}
                        onBlur={(e) => void onChangePoints(eq.questionId, Number(e.target.value))}
                      />
                    </label>
                    {editable && (
                      <button
                        type="button"
                        onClick={() => void onRemove(eq.questionId)}
                        className="text-xs text-red-600 hover:underline"
                        title="Chỉ bỏ liên kết khỏi đề"
                      >
                        Bỏ
                      </button>
                    )}
                  </li>
                );
              })}
              {!sortedQuestions.length && (
                <li className="py-8 text-center text-sm text-slate-500">
                  Chưa có câu trên đề.
                  {editable && (
                    <>
                      {' '}
                      <button
                        type="button"
                        onClick={openCreateTab}
                        className="font-medium text-accentDark hover:underline"
                      >
                        Tạo câu mới
                      </button>{' '}
                      hoặc thêm từ ngân hàng.
                    </>
                  )}
                </li>
              )}
            </ul>
          </section>

          {showPreview && (
            <section className="space-y-3 rounded-xl border border-mist bg-white/90 p-4 shadow-sm">
              <h3 className="font-semibold text-ink">Preview đề</h3>
              {sortedQuestions.map((eq) => {
                const q = questionMap[eq.questionId];
                if (!q) return null;
                return (
                  <div key={eq.questionId} className="rounded-lg border border-mist/80 p-3">
                    <p className="mb-2 text-xs font-medium text-slate-500">
                      Câu {eq.order} · {eq.points}đ
                    </p>
                    <QuestionPreview
                      content={q.content}
                      options={q.options}
                      answer={q.answer}
                      explanation={q.explanation}
                    />
                  </div>
                );
              })}
              {!sortedQuestions.length && (
                <p className="text-sm text-slate-500">Chưa có câu để xem trước.</p>
              )}
            </section>
          )}

          {editable && rightTab === 'create' && (
            <section
              id="exam-question-editor"
              ref={editorRef}
              className="scroll-mt-24 rounded-xl border border-accent/30 bg-white p-4 shadow-sm ring-1 ring-accent/10"
            >
              <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h2 className="font-semibold text-ink">Soạn câu hỏi mới</h2>
                  <p className="text-xs text-slate-500">
                    Lưu thành Question draft và gắn vào đề ngay — không copy nội dung vào đề.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setRightTab('bank')}
                  className="text-xs text-slate-500 hover:text-ink"
                >
                  Đóng
                </button>
              </div>

              <QuestionForm
                key={formNonce}
                hideHeader
                lockTaxonomy
                defaultSubjectId={meta.subjectId}
                defaultGrade={meta.grade}
                submitLabel="Gắn vào đề"
                secondarySubmitLabel="Gắn vào đề & tạo câu tiếp"
                onCancel={() => setRightTab('bank')}
                onAfterContinue={scrollToEditor}
                footerExtra={bankFooter}
                onSubmit={onCreateAndClose}
                onSecondarySubmit={onCreateAndContinue}
              />
            </section>
          )}

          {editable && rightTab === 'bulk' && (
            <section
              id="exam-question-editor"
              ref={editorRef}
              className="scroll-mt-24 rounded-xl border border-accent/30 bg-white p-4 shadow-sm ring-1 ring-accent/10"
            >
              <BulkQuestionTextImport
                onCreateOne={onBulkCreateOne}
                footerExtra={bankFooter}
                onClose={() => setRightTab('bank')}
                onComplete={(count) => showFlash(`Đã tạo ${count} câu từ text và gắn vào đề`)}
              />
            </section>
          )}
        </div>

        {/* Right: bank picker */}
        <aside className="h-fit space-y-3 rounded-xl border border-mist bg-white/90 p-3.5 shadow-sm xl:sticky xl:top-[4.5rem]">
          <div className="flex gap-1 rounded-lg bg-slate-100 p-0.5 text-xs font-medium">
            <button
              type="button"
              disabled={!editable}
              onClick={() => setRightTab('bank')}
              className={`flex-1 rounded-md px-2 py-1.5 ${
                rightTab === 'bank' ? 'bg-white text-ink shadow-sm' : 'text-slate-500'
              }`}
            >
              Ngân hàng
            </button>
            <button
              type="button"
              disabled={!editable}
              onClick={openCreateTab}
              className={`flex-1 rounded-md px-2 py-1.5 ${
                rightTab === 'create' ? 'bg-white text-ink shadow-sm' : 'text-slate-500'
              }`}
            >
              Tạo mới
            </button>
            <button
              type="button"
              disabled={!editable}
              onClick={openBulkTab}
              className={`flex-1 rounded-md px-2 py-1.5 ${
                rightTab === 'bulk' ? 'bg-white text-ink shadow-sm' : 'text-slate-500'
              }`}
            >
              Dán text
            </button>
          </div>

          {!editable && (
            <p className="text-sm text-slate-500">Đề đã khóa — không thêm/sửa cấu trúc.</p>
          )}

          {editable && rightTab === 'bank' && (
            <div className="space-y-2">
              <select
                className="w-full rounded-md border border-mist px-2 py-1.5 text-sm"
                value={selectedBankId}
                onChange={(e) => setSelectedBankId(e.target.value)}
              >
                <option value="">Published · môn/lớp</option>
                {banks.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => void loadBankPool()}
                className="w-full rounded-md border border-mist px-3 py-1.5 text-sm hover:border-accent"
              >
                {bankLoading ? 'Đang tải…' : 'Làm mới danh sách'}
              </button>
              <ul className="max-h-[28rem] space-y-1.5 overflow-y-auto">
                {bankPool.map((q) => (
                  <li
                    key={q.id}
                    className="flex items-start justify-between gap-2 rounded-md border border-mist/80 px-2 py-1.5 text-sm"
                  >
                    <span className="min-w-0">
                      <span className="line-clamp-2 text-ink">{snippet(q)}</span>
                      <span className="mt-0.5 block text-[11px] text-slate-500">
                        {TYPE_LABEL[q.type] ?? q.type} · {q.points}đ
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => void onAddFromBank(q.id)}
                      className="shrink-0 rounded border border-mist px-2 py-0.5 text-xs text-accentDark hover:border-accent"
                    >
                      Thêm
                    </button>
                  </li>
                ))}
                {!bankLoading && !bankPool.length && (
                  <p className="py-4 text-center text-xs text-slate-500">Không còn câu phù hợp.</p>
                )}
              </ul>
            </div>
          )}

          {editable && rightTab === 'create' && (
            <div className="space-y-2 text-sm text-slate-600">
              <p>
                Form soạn câu nằm ở cột giữa. Sau khi gắn, dùng{' '}
                <strong className="font-medium text-ink">Gắn vào đề & tạo câu tiếp</strong> để giữ
                nhịp soạn liên tục.
              </p>
              <button
                type="button"
                onClick={scrollToEditor}
                className="w-full rounded-md border border-accent px-3 py-2 text-sm font-medium text-accentDark hover:bg-teal-50"
              >
                Kéo tới form soạn câu
              </button>
            </div>
          )}

          {editable && rightTab === 'bulk' && (
            <div className="space-y-2 text-sm text-slate-600">
              <p>
                Dán nhiều câu theo field (<code className="text-xs">TYPE</code>,{' '}
                <code className="text-xs">Q</code>, <code className="text-xs">A)</code>,{' '}
                <code className="text-xs">ANSWER</code>…) rồi tạo hàng loạt — hỗ trợ TN, Đ/S, điền,
                trả lời ngắn.
              </p>
              <button
                type="button"
                onClick={scrollToEditor}
                className="w-full rounded-md border border-accent px-3 py-2 text-sm font-medium text-accentDark hover:bg-teal-50"
              >
                Kéo tới khung dán text
              </button>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
