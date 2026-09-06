'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AuthGate } from '@/components/auth/AuthGate';
import { QuestionForm } from '@/components/questions/QuestionForm';
import { createQuestion } from '@/lib/api-client';

function NewQuestionBody() {
  const router = useRouter();

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold text-ink">Tạo câu hỏi</h1>
          <p className="mt-1 text-sm text-slate-600">
            Môn/lớp/chủ đề, rich content, đáp án và lời giải — lưu dưới dạng draft.
          </p>
        </div>
        <Link href="/questions" className="text-sm text-accentDark hover:underline">
          ← Danh sách
        </Link>
      </div>

      <QuestionForm
        submitLabel="Lưu draft"
        onSubmit={async (payload) => {
          const res = await createQuestion(payload);
          router.push(`/questions/${res.question.id}`);
        }}
        onCancel={() => router.push('/questions')}
      />
    </div>
  );
}

export default function NewQuestionPage() {
  return (
    <AuthGate roles={['admin', 'teacher']}>
      <NewQuestionBody />
    </AuthGate>
  );
}
