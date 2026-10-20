import type { ContentBlock, QuestionOption, StudentAnswerValue } from '@/types/content';

function optionText(opt: QuestionOption): string {
  const content = opt.content;
  const blocks: ContentBlock[] = Array.isArray(content)
    ? content.filter((block): block is ContentBlock => Boolean(block && typeof block === 'object' && 'type' in block))
    : content && typeof content === 'object' && 'type' in content
      ? [content as ContentBlock]
      : [];
  return blocks
    .map((block) => {
      if (block.type === 'text' || block.type === 'latex') return block.value;
      return '';
    })
    .filter(Boolean)
    .join(' ');
}

export function isPairMap(value: StudentAnswerValue): value is Record<string, string> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

export function sameAnswerValue(a: StudentAnswerValue, b: StudentAnswerValue): boolean {
  return stableAnswer(a) === stableAnswer(b);
}

function stableAnswer(value: StudentAnswerValue): string {
  if (isPairMap(value)) {
    const entries = Object.entries(value).sort(([left], [right]) => left.localeCompare(right));
    return JSON.stringify(entries);
  }
  return JSON.stringify(value);
}

function optionLabel(options: QuestionOption[], id: string): string {
  const opt = options.find((item) => item.id === id);
  if (!opt) return id;
  const text = optionText(opt).trim();
  return text ? `${id}. ${text}` : id;
}

export function formatAnswerValue(options: QuestionOption[], value: StudentAnswerValue): string {
  if (value == null || value === '') return '(trống)';
  if (Array.isArray(value)) {
    if (value.length === 0) return '(trống)';
    return value.map((id, index) => `${index + 1}. ${optionLabel(options, id)}`).join(' → ');
  }
  if (isPairMap(value)) {
    const entries = Object.entries(value);
    if (entries.length === 0) return '(trống)';
    return entries
      .map(([left, right]) => `${optionLabel(options, left)} → ${optionLabel(options, right)}`)
      .join('; ');
  }
  const asOption = options.find((item) => item.id === String(value));
  return asOption ? optionLabel(options, asOption.id) : String(value);
}
