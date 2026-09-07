'use client';

import { useEffect, useState } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { getMedia } from '@/lib/api-client';
import { normalizeLatexInput } from '@/lib/latex';
import type { ContentBlock, QuestionOption } from '@/types/content';

function Latex({ value, displayMode = true }: { value: string; displayMode?: boolean }) {
  const source = normalizeLatexInput(value);
  try {
    const html = katex.renderToString(source, { throwOnError: false, displayMode });
    if (displayMode) {
      return (
        <div
          className="overflow-x-auto py-1 text-ink"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      );
    }
    return (
      <span
        className="inline-block max-w-full overflow-x-auto align-middle text-ink"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  } catch {
    return <code className="rounded bg-mist/60 px-1.5 py-0.5 text-sm">{value}</code>;
  }
}

function ImageBlock({ mediaId, compact }: { mediaId: string; compact?: boolean }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void getMedia(mediaId)
      .then((res) => {
        if (!cancelled) setUrl(res.media.url);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [mediaId]);

  if (failed) {
    return <p className="text-sm text-slate-500">(Không tải được ảnh {mediaId.slice(0, 8)}…)</p>;
  }
  if (!url) {
    return <p className="text-sm text-slate-400">Đang tải ảnh…</p>;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt=""
      className={`${compact ? 'max-h-24' : 'max-h-64'} max-w-full rounded-md border border-mist object-contain`}
    />
  );
}

export function ContentBlocksView({
  blocks,
  compact = false,
}: {
  blocks: ContentBlock[];
  /** Inline LaTeX + tighter spacing (dùng cho phương án). */
  compact?: boolean;
}) {
  if (!blocks.length) {
    return <p className="text-sm text-slate-500">(Không có nội dung)</p>;
  }
  return (
    <div className={compact ? 'space-y-1' : 'space-y-2'}>
      {blocks.map((block, i) => {
        if (block.type === 'text') {
          return (
            <p
              key={i}
              className={`whitespace-pre-wrap text-ink ${compact ? 'text-sm' : ''}`}
            >
              {block.value}
            </p>
          );
        }
        if (block.type === 'latex') {
          return <Latex key={i} value={block.value} displayMode={!compact} />;
        }
        return <ImageBlock key={i} mediaId={block.mediaId} compact={compact} />;
      })}
    </div>
  );
}

/** Chuẩn hóa content phương án (single block / mảng / legacy) → ContentBlock[]. */
export function normalizeOptionContent(
  content: QuestionOption['content'] | ContentBlock[],
): ContentBlock[] {
  if (Array.isArray(content)) {
    return content.length > 0 ? content : [{ type: 'text', value: '' }];
  }
  if (content && typeof content === 'object' && 'type' in content) {
    return [content as ContentBlock];
  }
  const value = String((content as { value?: string })?.value ?? '');
  return [{ type: 'text', value }];
}

export function optionHasContent(blocks: ContentBlock[]): boolean {
  return blocks.some((b) => {
    if (b.type === 'image') return Boolean(b.mediaId);
    return b.value.trim().length > 0;
  });
}

export function filterOptionBlocks(blocks: ContentBlock[]): ContentBlock[] {
  return blocks.filter((b) => {
    if (b.type === 'image') return Boolean(b.mediaId);
    return b.value.trim().length > 0;
  });
}

export function optionText(opt: QuestionOption): string {
  const blocks = normalizeOptionContent(opt.content);
  const parts = blocks.map((block) => {
    if (block.type === 'text' || block.type === 'latex') return block.value;
    return '(hình ảnh)';
  });
  return parts.filter(Boolean).join(' ') || '';
}

export function OptionContentView({
  content,
}: {
  content: QuestionOption['content'] | ContentBlock[];
}) {
  return <ContentBlocksView blocks={normalizeOptionContent(content)} compact />;
}

export function QuestionPreview({
  content,
  options,
  answer,
  explanation,
  showAnswer = true,
}: {
  content: ContentBlock[];
  options: QuestionOption[];
  answer: { type: string; value?: unknown; tolerance?: number };
  explanation?: { text?: string; steps?: string[] };
  showAnswer?: boolean;
}) {
  return (
    <div className="space-y-4 rounded-xl border border-mist bg-white/90 p-5">
      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Nội dung</p>
        <ContentBlocksView blocks={content} />
      </div>

      {options.length > 0 && (
        <ul className="space-y-2">
          {options.map((opt) => (
            <li
              key={opt.id}
              className="flex gap-2 rounded-md border border-mist px-3 py-2 text-sm"
            >
              <span className="font-semibold text-accentDark">{opt.id}.</span>
              <div className="min-w-0 flex-1">
                <OptionContentView content={opt.content} />
              </div>
            </li>
          ))}
        </ul>
      )}

      {showAnswer && (
        <div className="rounded-md bg-paper px-3 py-2 text-sm text-slate-700">
          <p className="font-medium text-ink">Đáp án</p>
          {answer.type === 'single' && <p>{String(answer.value)}</p>}
          {answer.type === 'multiple' && (
            <p>{Array.isArray(answer.value) ? answer.value.join(', ') : ''}</p>
          )}
          {answer.type === 'text' && (
            <p>{Array.isArray(answer.value) ? answer.value.join(' | ') : ''}</p>
          )}
          {answer.type === 'numeric' && (
            <p>
              {String(answer.value)}
              {answer.tolerance != null ? ` (±${answer.tolerance})` : ''}
            </p>
          )}
          {answer.type === 'manual' && <p>Chấm thủ công</p>}
        </div>
      )}

      {showAnswer && (explanation?.text || (explanation?.steps && explanation.steps.length > 0)) && (
        <div className="space-y-1 text-sm">
          <p className="font-medium text-ink">Lời giải</p>
          {explanation.text && <p className="whitespace-pre-wrap text-slate-700">{explanation.text}</p>}
          {explanation.steps && explanation.steps.length > 0 && (
            <ol className="list-decimal space-y-1 pl-5 text-slate-700">
              {explanation.steps.map((step, i) => (
                <li key={i}>{step}</li>
              ))}
            </ol>
          )}
        </div>
      )}
    </div>
  );
}
