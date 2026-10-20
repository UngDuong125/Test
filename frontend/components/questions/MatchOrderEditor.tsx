'use client';

import type { ReactNode } from 'react';
import { ContentBlocksEditor } from './ContentBlocksEditor';
import type { ContentBlock } from '@/types/content';

export type FormOption = { id: string; content: ContentBlock[] };

const MAX_ITEMS = 6;

function nextId(items: FormOption[], prefix: 'L' | 'R'): string {
  for (let n = 1; n <= MAX_ITEMS; n += 1) {
    const id = `${prefix}${n}`;
    if (!items.some((item) => item.id === id)) return id;
  }
  return '';
}

function nextOrderId(items: FormOption[]): string {
  const alphabet = 'ABCDEFGHIJKL';
  for (const char of alphabet) {
    if (!items.some((item) => item.id === char)) return char;
  }
  return '';
}

export function MatchingEditor({
  left,
  right,
  pairs,
  onChange,
  mediaUrls,
  onMediaUrl,
}: {
  left: FormOption[];
  right: FormOption[];
  pairs: Record<string, string>;
  onChange: (next: { left: FormOption[]; right: FormOption[]; pairs: Record<string, string> }) => void;
  mediaUrls: Record<string, string>;
  onMediaUrl: (mediaId: string, url: string) => void;
}) {
  function updateSide(side: 'left' | 'right', id: string, content: ContentBlock[]) {
    const list = side === 'left' ? left : right;
    const next = list.map((item) => (item.id === id ? { ...item, content } : item));
    onChange(side === 'left' ? { left: next, right, pairs } : { left, right: next, pairs });
  }

  return (
    <div className="space-y-4 rounded-xl border border-mist bg-white/90 p-5 shadow-sm">
      <div>
        <h3 className="font-semibold text-ink">Nối cặp</h3>
        <p className="mt-1 text-xs text-slate-500">
          Mỗi vế trái nối đúng một vế phải. Vế phải dư được dùng làm đáp án nhiễu. Khi làm bài, cột phải bị xáo trộn.
        </p>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <SideList
          title="Vế trái"
          items={left}
          mediaUrls={mediaUrls}
          onMediaUrl={onMediaUrl}
          onContent={(id, content) => updateSide('left', id, content)}
          onRemove={(id) => {
            const nextPairs = { ...pairs };
            delete nextPairs[id];
            onChange({ left: left.filter((item) => item.id !== id), right, pairs: nextPairs });
          }}
          onAdd={
            left.length < MAX_ITEMS
              ? () => {
                  const id = nextId(left, 'L');
                  if (!id) return;
                  onChange({
                    left: [...left, { id, content: [{ type: 'text', value: '' }] }],
                    right,
                    pairs,
                  });
                }
              : undefined
          }
          extra={(item) => (
            <label className="block text-xs text-slate-600">
              Nối với
              <select
                className="mt-1 w-full rounded-md border border-mist bg-white px-2 py-1.5 text-sm"
                value={pairs[item.id] ?? ''}
                onChange={(e) => onChange({ left, right, pairs: { ...pairs, [item.id]: e.target.value } })}
              >
                <option value="">Chọn vế phải</option>
                {right.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.id}
                  </option>
                ))}
              </select>
            </label>
          )}
        />
        <SideList
          title="Vế phải"
          items={right}
          mediaUrls={mediaUrls}
          onMediaUrl={onMediaUrl}
          onContent={(id, content) => updateSide('right', id, content)}
          onRemove={(id) => {
            const nextPairs = Object.fromEntries(
              Object.entries(pairs).filter(([, rightId]) => rightId !== id),
            );
            onChange({ left, right: right.filter((item) => item.id !== id), pairs: nextPairs });
          }}
          onAdd={
            right.length < MAX_ITEMS
              ? () => {
                  const id = nextId(right, 'R');
                  if (!id) return;
                  onChange({
                    left,
                    right: [...right, { id, content: [{ type: 'text', value: '' }] }],
                    pairs,
                  });
                }
              : undefined
          }
        />
      </div>
    </div>
  );
}

export function OrderingEditor({
  items,
  onChange,
  mediaUrls,
  onMediaUrl,
}: {
  items: FormOption[];
  onChange: (items: FormOption[]) => void;
  mediaUrls: Record<string, string>;
  onMediaUrl: (mediaId: string, url: string) => void;
}) {
  function move(index: number, direction: -1 | 1) {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= items.length) return;
    const next = [...items];
    const current = next[index]!;
    next[index] = next[nextIndex]!;
    next[nextIndex] = current;
    onChange(next);
  }

  return (
    <div className="space-y-3 rounded-xl border border-mist bg-white/90 p-5 shadow-sm">
      <div>
        <h3 className="font-semibold text-ink">Thứ tự đúng</h3>
        <p className="mt-1 text-xs text-slate-500">
          Xếp các mục theo thứ tự đúng. Học sinh thấy danh sách đã xáo trộn.
        </p>
      </div>
      {items.map((item, index) => (
        <div key={item.id} className="space-y-2 rounded-lg border border-mist p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium text-ink">
              {index + 1}. {item.id}
            </p>
            <div className="flex gap-1">
              <button
                type="button"
                disabled={index === 0}
                onClick={() => move(index, -1)}
                className="rounded-md border border-mist px-2 py-1 text-xs disabled:opacity-40"
              >
                Lên
              </button>
              <button
                type="button"
                disabled={index === items.length - 1}
                onClick={() => move(index, 1)}
                className="rounded-md border border-mist px-2 py-1 text-xs disabled:opacity-40"
              >
                Xuống
              </button>
              {items.length > 2 && (
                <button
                  type="button"
                  onClick={() => onChange(items.filter((row) => row.id !== item.id))}
                  className="rounded-md border border-mist px-2 py-1 text-xs text-red-600"
                >
                  Xóa
                </button>
              )}
            </div>
          </div>
          <ContentBlocksEditor
            compact
            blocks={item.content}
            onChange={(content) =>
              onChange(items.map((row) => (row.id === item.id ? { ...row, content } : row)))
            }
            mediaUrls={mediaUrls}
            onMediaUrl={onMediaUrl}
          />
        </div>
      ))}
      {items.length < 12 && (
        <button
          type="button"
          onClick={() => {
            const id = nextOrderId(items);
            if (!id) return;
            onChange([...items, { id, content: [{ type: 'text', value: '' }] }]);
          }}
          className="rounded-md border border-mist px-3 py-1.5 text-sm hover:border-accent"
        >
          + Thêm mục
        </button>
      )}
    </div>
  );
}

function SideList({
  title,
  items,
  onContent,
  onRemove,
  onAdd,
  extra,
  mediaUrls,
  onMediaUrl,
}: {
  title: string;
  items: FormOption[];
  onContent: (id: string, content: ContentBlock[]) => void;
  onRemove: (id: string) => void;
  onAdd?: () => void;
  extra?: (item: FormOption) => ReactNode;
  mediaUrls: Record<string, string>;
  onMediaUrl: (mediaId: string, url: string) => void;
}) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-ink">{title}</p>
      {items.map((item) => (
        <div key={item.id} className="space-y-2 rounded-lg border border-mist p-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-slate-500">{item.id}</p>
            {items.length > 2 && (
              <button type="button" onClick={() => onRemove(item.id)} className="text-xs text-red-600">
                Xóa
              </button>
            )}
          </div>
          <ContentBlocksEditor
            compact
            blocks={item.content}
            onChange={(content) => onContent(item.id, content)}
            mediaUrls={mediaUrls}
            onMediaUrl={onMediaUrl}
          />
          {extra?.(item)}
        </div>
      ))}
      {onAdd && (
        <button
          type="button"
          onClick={onAdd}
          className="rounded-md border border-mist px-3 py-1.5 text-sm hover:border-accent"
        >
          + Thêm
        </button>
      )}
    </div>
  );
}
