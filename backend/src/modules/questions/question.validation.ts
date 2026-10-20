import { AppError } from '../../domain/errors.js';
import type {
  ContentBlock,
  QuestionAnswer,
  QuestionOption,
  QuestionType,
} from '../../types/domain.js';

const OPTION_TYPES: QuestionType[] = ['multiple_choice', 'true_false', 'multiple_select'];
const AUTO_GRADE_TYPES: QuestionType[] = [
  'multiple_choice',
  'true_false',
  'fill_blank',
  'short_answer',
  'multiple_select',
  'numeric',
  'matching',
  'ordering',
];
const LEFT_MATCH_ID = /^L[1-9]\d*$/;
const RIGHT_MATCH_ID = /^R[1-9]\d*$/;

export function assertQuestionPayloadValid(input: {
  type: QuestionType;
  content: ContentBlock[];
  options: QuestionOption[];
  answer: QuestionAnswer;
  points: number;
}): void {
  if (!input.content.length) {
    throw new AppError(422, 'Question content is required', 'QUESTION_CONTENT_REQUIRED');
  }

  if (input.points <= 0) {
    throw new AppError(422, 'points must be > 0', 'INVALID_POINTS');
  }

  const optionIds = input.options.map((o) => o.id);
  if (new Set(optionIds).size !== optionIds.length) {
    throw new AppError(422, 'Duplicate option ids', 'DUPLICATE_OPTION_IDS');
  }

  if (OPTION_TYPES.includes(input.type)) {
    if (input.options.length < 2) {
      throw new AppError(422, 'Option-based questions need at least 2 options', 'OPTIONS_REQUIRED');
    }
  }

  if (input.type === 'true_false' && input.options.length !== 2) {
    throw new AppError(422, 'true_false must have exactly 2 options', 'TRUE_FALSE_OPTIONS');
  }

  if (AUTO_GRADE_TYPES.includes(input.type)) {
    if (input.answer.type === 'manual') {
      throw new AppError(422, 'Auto-gradable type requires a concrete answer', 'ANSWER_REQUIRED');
    }
  }

  if (input.type === 'essay' && input.answer.type !== 'manual') {
    throw new AppError(422, 'essay answer must be type manual', 'ESSAY_ANSWER');
  }

  if (input.answer.type === 'single') {
    if (!optionIds.includes(input.answer.value)) {
      throw new AppError(422, 'Answer references missing option', 'ANSWER_OPTION_MISSING');
    }
  }

  if (input.answer.type === 'multiple') {
    for (const id of input.answer.value) {
      if (!optionIds.includes(id)) {
        throw new AppError(422, 'Answer references missing option', 'ANSWER_OPTION_MISSING');
      }
    }
  }

  if (input.type === 'multiple_choice' && input.answer.type !== 'single') {
    throw new AppError(422, 'multiple_choice requires single answer', 'ANSWER_SHAPE');
  }

  if (input.type === 'true_false' && input.answer.type !== 'single') {
    throw new AppError(422, 'true_false requires single answer', 'ANSWER_SHAPE');
  }

  if (input.type === 'multiple_select' && input.answer.type !== 'multiple') {
    throw new AppError(422, 'multiple_select requires multiple answer', 'ANSWER_SHAPE');
  }

  if (
    (input.type === 'fill_blank' || input.type === 'short_answer') &&
    input.answer.type !== 'text'
  ) {
    throw new AppError(422, `${input.type} requires text answer`, 'ANSWER_SHAPE');
  }

  if (input.type === 'numeric' && input.answer.type !== 'numeric') {
    throw new AppError(422, 'numeric requires numeric answer', 'ANSWER_SHAPE');
  }

  if (input.type === 'matching') {
    const left = input.options.filter((opt) => LEFT_MATCH_ID.test(opt.id));
    const right = input.options.filter((opt) => RIGHT_MATCH_ID.test(opt.id));
    if (left.length + right.length !== input.options.length || left.length < 2 || right.length < 2) {
      throw new AppError(
        422,
        'matching needs at least 2 left (L1…) and 2 right (R1…) options',
        'MATCHING_OPTIONS',
      );
    }
    if (input.answer.type !== 'pairs') {
      throw new AppError(422, 'matching requires pairs answer', 'ANSWER_SHAPE');
    }
    const pairs = input.answer.value;
    const usedRight = new Set<string>();
    if (Object.keys(pairs).length !== left.length) {
      throw new AppError(422, 'Every left option must be paired once', 'MATCHING_PAIRS');
    }
    for (const item of left) {
      const rightId = pairs[item.id];
      if (!rightId || !right.some((opt) => opt.id === rightId) || usedRight.has(rightId)) {
        throw new AppError(422, 'Each left option pairs to a unique right option', 'MATCHING_PAIRS');
      }
      usedRight.add(rightId);
    }
  }

  if (input.type === 'ordering') {
    if (input.options.length < 2) {
      throw new AppError(422, 'ordering needs at least 2 items', 'ORDERING_ITEMS');
    }
    if (input.answer.type !== 'sequence') {
      throw new AppError(422, 'ordering requires sequence answer', 'ANSWER_SHAPE');
    }
    const ids = input.options.map((opt) => opt.id);
    const sequence = input.answer.value;
    const unique = new Set(sequence);
    const permutation =
      sequence.length === ids.length &&
      unique.size === sequence.length &&
      sequence.every((id) => ids.includes(id));
    if (!permutation) {
      throw new AppError(422, 'sequence must be a permutation of the option ids', 'ORDERING_SEQUENCE');
    }
  }
}

export function collectQuestionPayloadIssues(input: {
  type: QuestionType;
  content: ContentBlock[];
  options: QuestionOption[];
  answer: QuestionAnswer;
  points: number;
}): { code: string; message: string }[] {
  const issues: { code: string; message: string }[] = [];
  try {
    assertQuestionPayloadValid(input);
  } catch (err) {
    if (err instanceof AppError) {
      issues.push({ code: err.code ?? 'QUESTION_INVALID', message: err.message });
    } else {
      issues.push({ code: 'QUESTION_INVALID', message: 'Invalid question payload' });
    }
  }
  return issues;
}

export function canEditQuestionContent(status: string): boolean {
  return status === 'draft' || status === 'review';
}
