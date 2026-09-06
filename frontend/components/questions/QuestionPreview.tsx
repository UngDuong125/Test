'use client';

import { useEffect, useState } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { getMedia } from '@/lib/api-client';
import type { ContentBlock, QuestionOption } from '@/types/content';

function Latex({ value }: { value: string }) {
  try {
    const html = katex.renderToString(value, { throwOnError: false, displayMode: true });
    return (
      <div
        className="overflow-x-auto py-1 text-ink"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  } catch {
    return <code className="rounded bg-mist/60 px-1.5 py-0.5 text-sm">{value}</code>;
  }
}

function ImageBlock({ mediaId }: { mediaId: string }) {
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
    <img src={url} alt="" className="max-h-64 max-w-full rounded-md border border-mist object-contain" />
  );
}

export function ContentBlocksView({ blocks }: { blocks: ContentBlock[] }) {
  if (!blocks.length) {
    return <p className="text-sm text-slate-500">(Không có nội dung)</p>;
  }
  return (
    <div className="space-y-2">
      {blocks.map((block, i) => {
        if (block.type === 'text') {
          return (
            <p key={i} className="whitespace-pre-wrap text-ink">
              {block.value}
            </p>
          );
        }
        if (block.type === 'latex') {
          return <Latex key={i} value={block.value} />;
        }
        return <ImageBlock key={i} mediaId={block.mediaId} />;
      })}
    </div>
  );
}

export function optionText(opt: QuestionOption): string {
  const c = opt.content;
  if (Array.isArray(c)) {
    const first = c[0];
    if (first && first.type === 'text') return first.value;
    if (first && first.type === 'latex') return first.value;
    return '(rich)';
  }
  if (c && typeof c === 'object' && 'type' in c) {
    const block = c as ContentBlock;
    if (block.type === 'text' || block.type === 'latex') return block.value;
    if (block.type === 'image') return '(hình ảnh)';
  }
  return String((c as { value?: string })?.value ?? '');
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
              <span className="min-w-0 flex-1">{optionText(opt)}</span>
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
