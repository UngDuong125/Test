import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  canEditQuestionContent,
  collectQuestionPayloadIssues,
} from '../src/modules/questions/question.validation.js';
import type { QuestionAnswer, QuestionOption, QuestionType } from '../src/types/domain.js';

function opts(...ids: string[]): QuestionOption[] {
  return ids.map((id, i) => ({ id, content: [{ type: 'text', value: id }], order: i + 1 }));
}

function issues(type: QuestionType, options: QuestionOption[], answer: QuestionAnswer, points = 1) {
  return collectQuestionPayloadIssues({
    type,
    content: [{ type: 'text', value: 'Câu hỏi' }],
    options,
    answer,
    points,
  }).map((i) => i.code);
}

describe('question payload validation', () => {
  it('accepts valid payloads', () => {
    assert.deepEqual(issues('multiple_choice', opts('A', 'B', 'C'), { type: 'single', value: 'B' }), []);
    assert.deepEqual(issues('true_false', opts('A', 'B'), { type: 'single', value: 'A' }), []);
    assert.deepEqual(issues('multiple_select', opts('A', 'B', 'C'), { type: 'multiple', value: ['A', 'C'] }), []);
    assert.deepEqual(issues('fill_blank', [], { type: 'text', value: ['2x'] }), []);
    assert.deepEqual(issues('numeric', [], { type: 'numeric', value: 5 }), []);
    assert.deepEqual(issues('essay', [], { type: 'manual' }), []);
  });

  it('rejects broken payloads', () => {
    assert.deepEqual(issues('multiple_choice', opts('A', 'B'), { type: 'single', value: 'C' }), ['ANSWER_OPTION_MISSING']);
    assert.deepEqual(issues('multiple_choice', opts('A'), { type: 'single', value: 'A' }), ['OPTIONS_REQUIRED']);
    assert.deepEqual(issues('multiple_choice', opts('A', 'A'), { type: 'single', value: 'A' }), ['DUPLICATE_OPTION_IDS']);
    assert.deepEqual(issues('true_false', opts('A', 'B', 'C'), { type: 'single', value: 'A' }), ['TRUE_FALSE_OPTIONS']);
    assert.deepEqual(issues('multiple_choice', opts('A', 'B'), { type: 'multiple', value: ['A'] }), ['ANSWER_SHAPE']);
    assert.deepEqual(issues('fill_blank', [], { type: 'manual' }), ['ANSWER_REQUIRED']);
    assert.deepEqual(issues('essay', [], { type: 'text', value: ['x'] }), ['ESSAY_ANSWER']);
    assert.deepEqual(issues('numeric', [], { type: 'numeric', value: 1 }, 0), ['INVALID_POINTS']);
  });

  it('only draft / review questions are editable', () => {
    assert.equal(canEditQuestionContent('draft'), true);
    assert.equal(canEditQuestionContent('review'), true);
    assert.equal(canEditQuestionContent('published'), false);
  });
});
