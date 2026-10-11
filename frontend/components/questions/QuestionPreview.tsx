'use client';

import { useEffect, useState, type ReactNode } from 'react';
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

const INLINE_MARK_RE =
  /\\([*_])|\*\*(?![\s*])(.+?)(?<![\s*])\*\*|__(?![\s_])(.+?)(?<![\s_])__|\*(?![\s*])(.+?)(?<![\s*])\*/gs;

/** Định dạng nhẹ trong text: **đậm**, *nghiêng*, __gạch chân__; `\*`, `\_` để gõ ký tự thường. */
export function RichText({ value }: { value: string }) {
  return <>{renderInlineMarks(value)}</>;
}

function renderInlineMarks(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let last = 0;
  let key = 0;
  for (const m of text.matchAll(INLINE_MARK_RE)) {
    const start = m.index ?? 0;
    if (start > last) nodes.push(text.slice(last, start));
    const [, escaped, bold, underline, italic] = m;
    if (escaped !== undefined) {
      nodes.push(escaped);
    } else if (bold !== undefined) {
      nodes.push(<strong key={key++}>{renderInlineMarks(bold)}</strong>);
    } else if (underline !== undefined) {
      nodes.push(
        <span key={key++} className="underline underline-offset-2">
          {renderInlineMarks(underline)}
        </span>,
      );
    } else if (italic !== undefined) {
      nodes.push(<em key={key++}>{renderInlineMarks(italic)}</em>);
    }
    last = start + m[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

type FlowItem = { block: Extract<ContentBlock, { type: 'text' | 'latex' }>; index: number };
type BlockGroup =
  | { kind: 'flow'; items: FlowItem[] }
  | { kind: 'image'; mediaId: string; index: number };

/** Gom text ↔ LaTeX xen kẽ vào cùng một đoạn để LaTeX hiển thị inline giữa câu. */
function groupBlocks(blocks: ContentBlock[]): BlockGroup[] {
  const groups: BlockGroup[] = [];
  blocks.forEach((block, index) => {
    if (block.type === 'image') {
      groups.push({ kind: 'image', mediaId: block.mediaId, index });
      return;
    }
    const prev = groups[groups.length - 1];
    const prevItem = prev?.kind === 'flow' ? prev.items[prev.items.length - 1] : undefined;
    if (prev?.kind === 'flow' && prevItem && prevItem.block.type !== block.type) {
      prev.items.push({ block, index });
    } else {
      groups.push({ kind: 'flow', items: [{ block, index }] });
    }
  });
  return groups;
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
      {groupBlocks(blocks).map((group) => {
        if (group.kind === 'image') {
          return <ImageBlock key={group.index} mediaId={group.mediaId} compact={compact} />;
        }
        const first = group.items[0]!;
        if (group.items.length === 1 && first.block.type === 'latex') {
          return <Latex key={first.index} value={first.block.value} displayMode={!compact} />;
        }
        return (
          <p
            key={first.index}
            className={`whitespace-pre-wrap text-ink ${compact ? 'text-sm' : 'leading-relaxed'}`}
          >
            {group.items.map(({ block, index }) =>
              block.type === 'text' ? (
                <RichText key={index} value={block.value} />
              ) : (
                <Latex key={index} value={block.value} displayMode={false} />
              ),
            )}
          </p>
        );
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
  const correctIds = new Set<string>();
  if (showAnswer) {
    if (answer.type === 'single' && typeof answer.value === 'string') {
      correctIds.add(answer.value);
    } else if (answer.type === 'multiple' && Array.isArray(answer.value)) {
      for (const id of answer.value) {
        if (typeof id === 'string') correctIds.add(id);
      }
    }
  }

  return (
    <div className="space-y-4 rounded-xl border border-mist bg-white/90 p-5">
      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Nội dung</p>
        <ContentBlocksView blocks={content} />
      </div>

      {options.length > 0 && (
        <ul className="space-y-2">
          {options.map((opt) => {
            const isCorrect = correctIds.has(opt.id);
            return (
              <li
                key={opt.id}
                className={`flex gap-2 rounded-md border px-3 py-2 text-sm ${
                  isCorrect ? 'border-accent bg-accent/5' : 'border-mist'
                }`}
              >
                <span className="font-semibold text-accentDark">{opt.id}.</span>
                <div className="min-w-0 flex-1">
                  <OptionContentView content={opt.content} />
                </div>
                {isCorrect && (
                  <span className="shrink-0 self-start rounded border border-accent bg-white px-2 py-0.5 text-[11px] font-medium text-accentDark">
                    Đáp án đúng
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {showAnswer && answer.type !== 'single' && answer.type !== 'multiple' && (
        <div className="rounded-md bg-paper px-3 py-2 text-sm text-slate-700">
          <p className="font-medium text-ink">Đáp án</p>
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
