'use client';

import { useState } from 'react';
import { ContentBlocksEditor } from '@/components/questions/ContentBlocksEditor';
import { ApiError, addExamSection, deleteExamSection, updateExamSection } from '@/lib/api-client';
import type { ContentBlock, ExamSection } from '@/types/content';

function filledBlocks(blocks: ContentBlock[]): ContentBlock[] {
  return blocks.filter((block) => {
    if (block.type === 'image') return Boolean(block.mediaId);
    return block.value.trim().length > 0;
  });
}

export function LessonSectionsPanel({
  examId,
  editable,
  sections,
  onChange,
}: {
  examId: string;
  editable: boolean;
  sections: ExamSection[];
  onChange: (sections: ExamSection[]) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, { title: string; content: ContentBlock[] }>>({});
  const [mediaUrls, setMediaUrls] = useState<Record<string, string>>({});

  function draftOf(section: ExamSection) {
    return drafts[section.id] ?? { title: section.title, content: section.content ?? [] };
  }

  async function save(section: ExamSection) {
    const draft = draftOf(section);
    setBusyId(section.id);
    setError(null);
    try {
      const { section: saved } = await updateExamSection(examId, section.id, {
        title: draft.title.trim() || section.title,
        content: filledBlocks(draft.content),
      });
      onChange(sections.map((item) => (item.id === saved.id ? saved : item)));
      setDrafts((current) => {
        const next = { ...current };
        delete next[section.id];
        return next;
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Không lưu được lý thuyết');
    } finally {
      setBusyId(null);
    }
  }

  async function addSection() {
    setBusyId('new');
    setError(null);
    try {
      const { section } = await addExamSection(examId, {
        title: `Phần ${sections.length + 1}`,
        description: '',
        content: [],
      });
      onChange([...sections, section]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Không thêm được phần');
    } finally {
      setBusyId(null);
    }
  }

  async function remove(section: ExamSection) {
    if (!window.confirm(`Xóa phần “${section.title}”? Câu hỏi trong phần vẫn còn trên đề.`)) return;
    setBusyId(section.id);
    setError(null);
    try {
      await deleteExamSection(examId, section.id);
      onChange(sections.filter((item) => item.id !== section.id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Không xóa được phần');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="space-y-3 rounded-xl border border-mist bg-white/90 p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-semibold text-ink">Lý thuyết từng phần</h2>
          <p className="text-xs text-slate-500">
            Học sinh đọc phần này rồi mới làm các câu thuộc phần đó. Có thể kiểm tra đáp án ngay.
          </p>
        </div>
        {editable && (
          <button
            type="button"
            disabled={busyId === 'new'}
            onClick={() => void addSection()}
            className="rounded-md border border-mist px-3 py-1.5 text-sm hover:border-accent disabled:opacity-60"
          >
            Thêm phần
          </button>
        )}
      </div>
      {error && <p className="text-sm text-red-700">{error}</p>}
      {sections.length === 0 && (
        <p className="text-sm text-slate-500">Chưa có phần. Thêm một phần để viết lý thuyết.</p>
      )}
      {[...sections].sort((a, b) => a.order - b.order).map((section) => {
        const draft = draftOf(section);
        return (
          <div key={section.id} className="space-y-2 rounded-lg border border-mist p-3">
            <input
              className="w-full rounded-md border border-mist px-3 py-2 text-sm font-medium"
              disabled={!editable}
              value={draft.title}
              onChange={(e) =>
                setDrafts((current) => ({
                  ...current,
                  [section.id]: { ...draft, title: e.target.value },
                }))
              }
            />
            <ContentBlocksEditor
              blocks={draft.content.length ? draft.content : [{ type: 'text', value: '' }]}
              onChange={(content) =>
                setDrafts((current) => ({
                  ...current,
                  [section.id]: { title: draft.title, content },
                }))
              }
              mediaUrls={mediaUrls}
              onMediaUrl={(id, url) => setMediaUrls((current) => ({ ...current, [id]: url }))}
            />
            {editable && (
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={busyId === section.id}
                  onClick={() => void save(section)}
                  className="rounded-md bg-accent px-3 py-1.5 text-sm text-white disabled:opacity-60"
                >
                  {busyId === section.id ? 'Đang lưu…' : 'Lưu lý thuyết'}
                </button>
                <button
                  type="button"
                  disabled={busyId === section.id}
                  onClick={() => void remove(section)}
                  className="rounded-md border border-mist px-3 py-1.5 text-sm text-red-600"
                >
                  Xóa phần
                </button>
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}
