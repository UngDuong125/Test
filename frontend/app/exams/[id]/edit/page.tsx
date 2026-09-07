'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { AuthGate } from '@/components/auth/AuthGate';
import { StatsPanel } from '@/components/analytics/StatsPanel';
import { ExamComposer } from '@/components/exams/ExamComposer';
import { ApiError, getExam, getExamAnalytics } from '@/lib/api-client';
import type { Exam, ExamQuestion, ExamSection, Question } from '@/types/content';

function EditExamBody() {
  const params = useParams();
  const id = String(params.id ?? '');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [analytics, setAnalytics] = useState<{
    attemptCount: number;
    gradedCount: number;
    needsGradingCount: number;
    averageScore: number | null;
    averagePercentage: number | null;
    completionRate: number | null;
  } | null>(null);
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

    void getExamAnalytics(id)
      .then((a) => {
        if (!cancelled) setAnalytics(a);
      })
      .catch(() => {
        if (!cancelled) setAnalytics(null);
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
    <div className="space-y-4">
      {analytics && (
        <StatsPanel
          title="Thống kê đề"
          items={[
            { label: 'Lượt làm', value: analytics.attemptCount },
            { label: 'Đã chấm', value: analytics.gradedCount },
            { label: 'Chờ chấm', value: analytics.needsGradingCount },
            { label: 'Điểm TB', value: analytics.averageScore },
            {
              label: '% TB',
              value:
                analytics.averagePercentage != null
                  ? `${analytics.averagePercentage}%`
                  : null,
            },
            {
              label: 'Hoàn thành',
              value:
                analytics.completionRate != null
                  ? `${Math.round(analytics.completionRate * 100)}%`
                  : null,
            },
          ]}
        />
      )}
      <ExamComposer
        initialExam={data.exam}
        initialSections={data.sections}
        initialQuestions={data.questions}
        initialQuestionDetails={data.questionDetails}
      />
    </div>
  );
}

export default function EditExamPage() {
  return (
    <AuthGate roles={['admin', 'teacher']}>
      <EditExamBody />
    </AuthGate>
  );
}
