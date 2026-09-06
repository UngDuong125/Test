'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { AuthGate } from '@/components/auth/AuthGate';
import { ExamComposer } from '@/components/exams/ExamComposer';
import { ApiError, getExam } from '@/lib/api-client';
import type { Exam, ExamQuestion, ExamSection, Question } from '@/types/content';

function EditExamBody() {
  const params = useParams();
  const id = String(params.id ?? '');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<{
    exam: Exam;
    sections: ExamSection[];
    questions: ExamQuestion[];
    questionDetails: Question[];
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void getExam(id)
      .then((detail) => {
        if (!cancelled) {
          setData({
            exam: detail.exam,
            sections: detail.sections,
            questions: detail.questions,
            questionDetails: detail.questionDetails ?? [],
          });
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : 'Không tải được đề');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loading) {
    return <p className="px-4 py-8 text-slate-500">Đang tải đề…</p>;
  }

  if (error || !data) {
    return (
      <div className="mx-auto max-w-lg space-y-3 px-4 py-8">
        <p className="text-red-600">{error ?? 'Không tìm thấy đề'}</p>
        <Link href="/exams" className="text-accentDark hover:underline">
          ← Danh sách đề
        </Link>
      </div>
    );
  }

  return (
    <ExamComposer
      initialExam={data.exam}
      initialSections={data.sections}
      initialQuestions={data.questions}
      initialQuestionDetails={data.questionDetails}
    />
  );
}

export default function EditExamPage() {
  return (
    <AuthGate roles={['admin', 'teacher']}>
      <EditExamBody />
    </AuthGate>
  );
}
