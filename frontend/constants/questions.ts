import type { QuestionType } from '@/types/content';

/** MVP question types from question-management.md */
export const QUESTION_TYPES_MVP: { value: QuestionType; label: string }[] = [
  { value: 'multiple_choice', label: 'Trắc nghiệm (1 đáp án)' },
  { value: 'true_false', label: 'Đúng / Sai' },
  { value: 'fill_blank', label: 'Điền khuyết' },
  { value: 'short_answer', label: 'Trả lời ngắn' },
  { value: 'essay', label: 'Tự luận' },
];

export const QUESTION_TYPES_EXTENDED: { value: QuestionType; label: string }[] = [
  { value: 'multiple_select', label: 'Trắc nghiệm (nhiều đáp án)' },
  { value: 'numeric', label: 'Số học' },
];

export const QUESTION_TYPES_UI = [...QUESTION_TYPES_MVP, ...QUESTION_TYPES_EXTENDED];

export const DIFFICULTY_OPTIONS = [
  { value: 'easy', label: 'Dễ' },
  { value: 'medium', label: 'Trung bình' },
  { value: 'hard', label: 'Khó' },
] as const;

export const STATUS_LABELS: Record<string, string> = {
  draft: 'Nháp',
  review: 'Chờ duyệt',
  published: 'Đã publish',
  archived: 'Lưu trữ',
};

export const OPTION_IDS = ['A', 'B', 'C', 'D', 'E', 'F'] as const;

export function isOptionBasedType(type: QuestionType): boolean {
  return type === 'multiple_choice' || type === 'true_false' || type === 'multiple_select';
}

export function isAutoGradeType(type: QuestionType): boolean {
  return (
    type === 'multiple_choice' ||
    type === 'true_false' ||
    type === 'fill_blank' ||
    type === 'short_answer' ||
    type === 'multiple_select' ||
    type === 'numeric'
  );
}
