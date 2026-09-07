'use client';

import katex from 'katex';
import 'katex/dist/katex.min.css';
import { uploadMedia, ApiError } from '@/lib/api-client';
import { normalizeLatexInput } from '@/lib/latex';
import type { ContentBlock } from '@/types/content';

type Props = {
  blocks: ContentBlock[];
  onChange: (blocks: ContentBlock[]) => void;
  mediaUrls?: Record<string, string>;
  onMediaUrl?: (mediaId: string, url: string) => void;
  /** Giao diện gọn hơn (phương án trắc nghiệm). */
  compact?: boolean;
};

function LatexLivePreview({ value }: { value: string }) {
  const source = normalizeLatexInput(value.trim());
  if (!source) {
    return <p className="text-xs text-slate-400">Xem trước LaTeX sẽ hiện ở đây…</p>;
  }

  try {
    const html = katex.renderToString(source, { throwOnError: true, displayMode: false });
    return (
      <div className="space-y-1">
        <div
          className="overflow-x-auto text-ink"
          dangerouslySetInnerHTML={{ __html: html }}
        />
        {source !== value.trim() && (
          <p className="text-[11px] text-amber-700">
            Đã tự sửa escape thừa (ví dụ <code>\\frac</code> → <code>\frac</code>).
          </p>
        )}
      </div>
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'LaTeX không hợp lệ';
    return <p className="text-xs text-red-600">{message}</p>;
  }
}

export function ContentBlocksEditor({
  blocks,
  onChange,
  mediaUrls = {},
  onMediaUrl,
  compact = false,
}: Props) {
  function updateBlock(index: number, next: ContentBlock) {
    const copy = [...blocks];
    copy[index] = next;
    onChange(copy);
  }

  function removeBlock(index: number) {
    onChange(blocks.filter((_, i) => i !== index));
  }

  function moveBlock(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= blocks.length) return;
    const copy = [...blocks];
    const tmp = copy[index]!;
    copy[index] = copy[target]!;
    copy[target] = tmp;
    onChange(copy);
  }

  async function addImage(file: File | null) {
    if (!file) return;
    try {
      const res = await uploadMedia(file);
      onChange([...blocks, { type: 'image', mediaId: res.mediaId }]);
      onMediaUrl?.(res.mediaId, res.url);
    } catch (err) {
      throw err instanceof ApiError ? err : new Error('Upload thất bại');
    }
  }

  const pad = compact ? 'p-2' : 'p-3';
  const btn = compact
    ? 'rounded border border-mist px-1.5 py-0.5 text-[11px] hover:border-accent'
    : 'rounded border border-mist px-2 py-0.5 hover:border-accent';
  const addBtn = compact
    ? 'rounded-md border border-mist px-2 py-1 text-xs hover:border-accent'
    : 'rounded-md border border-mist px-3 py-1.5 text-sm hover:border-accent';

  return (
    <div className={compact ? 'space-y-2' : 'space-y-3'}>
      {blocks.map((block, index) => (
        <div key={index} className={`rounded-md border border-mist bg-white ${pad}`}>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-medium uppercase text-slate-500">{block.type}</span>
            <div className="flex gap-1 text-xs">
              <button
                type="button"
                className={btn}
                onClick={() => moveBlock(index, -1)}
                disabled={index === 0}
              >
                ↑
              </button>
              <button
                type="button"
                className={btn}
                onClick={() => moveBlock(index, 1)}
                disabled={index === blocks.length - 1}
              >
                ↓
              </button>
              <button
                type="button"
                className={`${btn} text-red-600 hover:border-red-300`}
                onClick={() => removeBlock(index)}
              >
                Xóa
              </button>
            </div>
          </div>

          {block.type === 'text' && (
            <textarea
              rows={compact ? 1 : 3}
              className="w-full rounded-md border border-mist px-3 py-2 text-sm"
              value={block.value}
              onChange={(e) => updateBlock(index, { type: 'text', value: e.target.value })}
              placeholder="Nội dung văn bản…"
            />
          )}
          {block.type === 'latex' && (
            <div className="space-y-2">
              <textarea
                rows={compact ? 1 : 2}
                className="w-full rounded-md border border-mist px-3 py-2 font-mono text-sm"
                value={block.value}
                onChange={(e) => updateBlock(index, { type: 'latex', value: e.target.value })}
                onBlur={(e) => {
                  const normalized = normalizeLatexInput(e.target.value);
                  if (normalized !== e.target.value) {
                    updateBlock(index, { type: 'latex', value: normalized });
                  }
                }}
                placeholder={String.raw`\frac{a}{b}`}
                spellCheck={false}
              />
              <p className="text-[11px] text-slate-500">
                Một dấu backslash trước lệnh, ví dụ <code className="font-mono">{String.raw`\frac{a}{b}`}</code>,{' '}
                <code className="font-mono">{String.raw`\sqrt{2}`}</code>. Không cần gõ{' '}
                <code className="font-mono">\\</code>.
              </p>
              <div className="rounded-md border border-dashed border-mist bg-paper/60 px-3 py-2">
                <LatexLivePreview value={block.value} />
              </div>
            </div>
          )}
          {block.type === 'image' && (
            <div className="text-sm text-slate-600">
              <p className="font-mono text-xs">mediaId: {block.mediaId}</p>
              {mediaUrls[block.mediaId] && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={mediaUrls[block.mediaId]}
                  alt=""
                  className={`mt-2 rounded border border-mist object-contain ${compact ? 'max-h-24' : 'max-h-40'}`}
                />
              )}
            </div>
          )}
        </div>
      ))}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={addBtn}
          onClick={() => onChange([...blocks, { type: 'text', value: '' }])}
        >
          + Text
        </button>
        <button
          type="button"
          className={addBtn}
          onClick={() => onChange([...blocks, { type: 'latex', value: '' }])}
        >
          + LaTeX
        </button>
        <label className={`cursor-pointer ${addBtn}`}>
          + Ảnh
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0] ?? null;
              e.target.value = '';
              void addImage(file).catch((err: unknown) => {
                alert(err instanceof Error ? err.message : 'Upload thất bại');
              });
            }}
          />
        </label>
      </div>
    </div>
  );
}
