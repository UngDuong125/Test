import type { PublicUser, TagKey } from '@/types/auth';
import type {
  ClassMember,
  ClassRecord,
  Exam,
  ExamAssignment,
  ExamQuestion,
  ExamSection,
  Question,
  QuestionBank,
  Subject,
  Topic,
} from '@/types/content';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

type ApiOptions = Omit<RequestInit, 'body'> & {
  body?: unknown;
};

export async function api<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const { body, headers, ...rest } = options;
  const res = await fetch(`${API_BASE}${path}`, {
    ...rest,
    credentials: 'include',
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 204) {
    return undefined as T;
  }

  const data = (await res.json().catch(() => ({}))) as {
    error?: { message?: string; code?: string };
  };

  if (!res.ok) {
    throw new ApiError(res.status, data.error?.message ?? res.statusText, data.error?.code);
  }

  return data as T;
}

export function login(login: string, password: string) {
  return api<{ user: PublicUser; expiresAt: string }>('/api/auth/login', {
    method: 'POST',
    body: { login, password },
  });
}

export function logout() {
  return api<void>('/api/auth/logout', { method: 'POST' });
}

export function getMe() {
  return api<{ user: PublicUser }>('/api/auth/me');
}

export function changePassword(currentPassword: string, newPassword: string) {
  return api<{ user: PublicUser; requireLogin: boolean }>('/api/auth/change-password', {
    method: 'POST',
    body: { currentPassword, newPassword },
  });
}

export function forgotPassword(email: string) {
  return api<{ ok: true }>('/api/auth/forgot-password', {
    method: 'POST',
    body: { email },
  });
}

export function resetPassword(token: string, newPassword: string) {
  return api<{ user: PublicUser; requireLogin: boolean }>('/api/auth/reset-password', {
    method: 'POST',
    body: { token, newPassword },
  });
}

export function listUsers() {
  return api<{ users: PublicUser[] }>('/api/admin/users');
}

export function inviteUser(input: {
  email: string;
  username: string;
  role: string;
  displayName?: string;
}) {
  return api<{ user: PublicUser; emailDelivered: boolean }>('/api/admin/users/invite', {
    method: 'POST',
    body: input,
  });
}

export function resendInvite(userId: string) {
  return api<{ emailDelivered: boolean }>(`/api/admin/users/${userId}/resend-invite`, {
    method: 'POST',
  });
}

export function updateUserStatus(userId: string, status: string) {
  return api<{ user: PublicUser }>(`/api/admin/users/${userId}/status`, {
    method: 'PATCH',
    body: { status },
  });
}

export function updateUserRole(userId: string, role: string) {
  return api<{ user: PublicUser }>(`/api/admin/users/${userId}/role`, {
    method: 'PATCH',
    body: { role },
  });
}

// --- Taxonomy / Questions / Banks / Exams ---

export function listSubjects() {
  return api<{ subjects: Subject[] }>('/api/subjects');
}

export function listTopics(params?: { subjectId?: TagKey; grade?: number }) {
  const qs = new URLSearchParams();
  if (params?.subjectId) qs.set('subjectId', params.subjectId);
  if (params?.grade !== undefined) qs.set('grade', String(params.grade));
  const suffix = qs.toString() ? `?${qs}` : '';
  return api<{ topics: Topic[] }>(`/api/topics${suffix}`);
}

export function listQuestions(params?: Record<string, string | number | undefined>) {
  const qs = new URLSearchParams();
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== '') qs.set(k, String(v));
    }
  }
  const suffix = qs.toString() ? `?${qs}` : '';
  return api<{ items: Question[]; total: number }>(`/api/questions${suffix}`);
}

export function getQuestion(id: string) {
  return api<{ question: Question }>(`/api/questions/${id}`);
}

export function createQuestion(body: unknown) {
  return api<{ question: Question }>('/api/questions', { method: 'POST', body });
}

export function updateQuestion(id: string, body: unknown) {
  return api<{ question: Question }>(`/api/questions/${id}`, { method: 'PATCH', body });
}

export function deleteQuestion(id: string) {
  return api<void>(`/api/questions/${id}`, { method: 'DELETE' });
}

export function submitQuestionReview(id: string) {
  return api<{ question: Question }>(`/api/questions/${id}/submit-review`, { method: 'POST' });
}

export function publishQuestion(id: string) {
  return api<{ question: Question }>(`/api/questions/${id}/publish`, { method: 'POST' });
}

export function archiveQuestion(id: string) {
  return api<{ question: Question }>(`/api/questions/${id}/archive`, { method: 'POST' });
}

export function rejectQuestionReview(id: string) {
  return api<{ question: Question }>(`/api/questions/${id}/reject-review`, { method: 'POST' });
}

export function duplicateQuestion(id: string) {
  return api<{ question: Question }>(`/api/questions/${id}/duplicate`, { method: 'POST' });
}

export function getMedia(id: string) {
  return api<{
    media: { id: string; url: string; mimeType: string; byteSize: number };
  }>(`/api/media/${id}`);
}

export function listQuestionBanks(params?: Record<string, string | number | undefined>) {
  const qs = new URLSearchParams();
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== '') qs.set(k, String(v));
    }
  }
  const suffix = qs.toString() ? `?${qs}` : '';
  return api<{ items: QuestionBank[]; total: number }>(`/api/question-banks${suffix}`);
}

export function createQuestionBank(body: {
  name: string;
  description?: string;
  subjectId: TagKey;
  grade: number;
}) {
  return api<{ bank: QuestionBank }>('/api/question-banks', { method: 'POST', body });
}

export function getQuestionBank(id: string) {
  return api<{ bank: QuestionBank }>(`/api/question-banks/${id}`);
}

export function listBankQuestions(bankId: string) {
  return api<{ items: Question[]; total: number }>(`/api/question-banks/${bankId}/questions`);
}

export function addQuestionsToBank(bankId: string, questionIds: string[]) {
  return api<{ added: number }>(`/api/question-banks/${bankId}/questions`, {
    method: 'POST',
    body: { questionIds },
  });
}

export function listExams(params?: Record<string, string | number | undefined>) {
  const qs = new URLSearchParams();
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== '') qs.set(k, String(v));
    }
  }
  const suffix = qs.toString() ? `?${qs}` : '';
  return api<{ items: Exam[]; total: number }>(`/api/exams${suffix}`);
}

export function getExam(id: string) {
  return api<{
    exam: Exam;
    sections: ExamSection[];
    questions: ExamQuestion[];
    questionDetails: Question[];
  }>(`/api/exams/${id}`);
}

export function createExam(body: unknown) {
  return api<{ exam: Exam }>('/api/exams', { method: 'POST', body });
}

export function updateExam(id: string, body: unknown) {
  return api<{ exam: Exam }>(`/api/exams/${id}`, { method: 'PATCH', body });
}

export function addExamQuestions(
  examId: string,
  body: { questionIds: string[]; sectionId?: string | null; points?: number },
) {
  return api<{ questions: ExamQuestion[]; questionDetails: Question[] }>(
    `/api/exams/${examId}/questions`,
    { method: 'POST', body },
  );
}

export function createExamQuestion(examId: string, body: unknown) {
  return api<{ question: Question; examQuestion: ExamQuestion }>(
    `/api/exams/${examId}/questions/create`,
    { method: 'POST', body },
  );
}

export function updateExamQuestion(
  examId: string,
  questionId: string,
  body: { sectionId?: string | null; order?: number; points?: number },
) {
  return api<{ question: ExamQuestion }>(`/api/exams/${examId}/questions/${questionId}`, {
    method: 'PATCH',
    body,
  });
}

export function removeExamQuestion(examId: string, questionId: string) {
  return api<void>(`/api/exams/${examId}/questions/${questionId}`, { method: 'DELETE' });
}

export function validateExam(id: string) {
  return api<{
    ok: boolean;
    errors: { code: string; message: string; questionId?: string }[];
    warnings: { code: string; message: string; questionId?: string }[];
    sumPoints: number;
    totalPoints: number;
    draftQuestionIds: string[];
  }>(`/api/exams/${id}/validate`, { method: 'POST' });
}

export function publishExam(id: string, body?: { publishDraftQuestions?: boolean }) {
  return api<{
    exam: Exam;
    sections: ExamSection[];
    questions: ExamQuestion[];
    questionDetails: Question[];
  }>(`/api/exams/${id}/publish`, { method: 'POST', body: body ?? {} });
}

export function generateExam(body: unknown) {
  return api<{
    exam: { id: string; status: string; totalPoints: number; questionCount: number };
    warnings: string[];
  }>('/api/exams/generate', { method: 'POST', body });
}

export function addExamSection(examId: string, body: { title: string; description?: string }) {
  return api<{ section: ExamSection }>(`/api/exams/${examId}/sections`, {
    method: 'POST',
    body,
  });
}

// --- Classes / Assignments / Upload ---

export function listClasses(params?: Record<string, string | number | undefined>) {
  const qs = new URLSearchParams();
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== '') qs.set(k, String(v));
    }
  }
  const suffix = qs.toString() ? `?${qs}` : '';
  return api<{ items: ClassRecord[]; total: number }>(`/api/classes${suffix}`);
}

export function createClass(body: { name: string; grade: number }) {
  return api<{ class: ClassRecord }>('/api/classes', { method: 'POST', body });
}

export function getClass(id: string) {
  return api<{ class: ClassRecord }>(`/api/classes/${id}`);
}

export function updateClass(id: string, body: { name?: string; grade?: number }) {
  return api<{ class: ClassRecord }>(`/api/classes/${id}`, { method: 'PATCH', body });
}

export function deleteClass(id: string) {
  return api<void>(`/api/classes/${id}`, { method: 'DELETE' });
}

export function listClassMembers(classId: string) {
  return api<{ members: ClassMember[] }>(`/api/classes/${classId}/members`);
}

export function addClassMembers(
  classId: string,
  body: { userIds?: string[]; emails?: string[] },
) {
  return api<{
    added: ClassMember[];
    errors: { identifier: string; code: string; message: string }[];
  }>(`/api/classes/${classId}/members`, { method: 'POST', body });
}

export function removeClassMember(classId: string, userId: string) {
  return api<void>(`/api/classes/${classId}/members/${userId}`, { method: 'DELETE' });
}

export function listMyClasses() {
  return api<{ items: ClassRecord[] }>('/api/students/me/classes');
}

export function listExamAssignments(params?: Record<string, string | number | undefined>) {
  const qs = new URLSearchParams();
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== '') qs.set(k, String(v));
    }
  }
  const suffix = qs.toString() ? `?${qs}` : '';
  return api<{ items: ExamAssignment[]; total: number }>(`/api/exam-assignments${suffix}`);
}

export function assignExam(
  examId: string,
  body: {
    targetType: 'user' | 'class';
    targetId: string;
    availableFrom: string;
    deadline: string;
    attemptLimit: number;
    settings?: Partial<{
      shuffleQuestions: boolean;
      shuffleOptions: boolean;
      showResult: boolean;
      showExplanation: boolean;
    }>;
  },
) {
  return api<{ assignments: ExamAssignment[]; warnings: string[] }>(
    `/api/exams/${examId}/assign`,
    { method: 'POST', body },
  );
}

export function listAssignmentsForExam(examId: string) {
  return api<{ items: ExamAssignment[]; total: number }>(`/api/exams/${examId}/assignments`);
}

export function cancelAssignment(id: string) {
  return api<{ assignment: ExamAssignment }>(`/api/exam-assignments/${id}/cancel`, {
    method: 'POST',
  });
}

export function listMyAssignments(params?: Record<string, string | number | undefined>) {
  const qs = new URLSearchParams();
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== '') qs.set(k, String(v));
    }
  }
  const suffix = qs.toString() ? `?${qs}` : '';
  return api<{ items: ExamAssignment[]; total: number }>(
    `/api/students/me/assignments${suffix}`,
  );
}

export async function uploadMedia(file: File) {
  const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000';
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${API_BASE}/api/upload`, {
    method: 'POST',
    credentials: 'include',
    body: form,
  });
  const data = (await res.json().catch(() => ({}))) as {
    mediaId?: string;
    url?: string;
    mimeType?: string;
    byteSize?: number;
    error?: { message?: string; code?: string };
  };
  if (!res.ok) {
    throw new ApiError(res.status, data.error?.message ?? res.statusText, data.error?.code);
  }
  return data as { mediaId: string; url: string; mimeType: string; byteSize: number };
}
