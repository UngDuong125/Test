# Cấu trúc dự án

## Nguyên tắc kiến trúc

- Monorepo npm workspaces (`test-archive-workspace`) gồm `frontend`, `backend`; database nằm trong `supabase/`.
- Frontend chỉ hiển thị UI và gọi API; không tự quyết định quyền, điểm hoặc EXP. Route guard phía UI (`AuthGate`) chỉ để điều hướng.
- Backend là nơi xác thực session, RBAC, kiểm tra quyền sở hữu, snapshot attempt, chấm điểm, ghi EXP và lập lịch SRS.
- Database tách nội dung tái sử dụng (`Question`, `QuestionBank`, `VocabularyEntry`, `VocabularyBank`) khỏi đề (`Exam`), phân phối (`ExamAssignment`, `VocabularyAssignment`) và lịch sử (`Attempt`, `Answer`, `StudentVocabularyCard`).
- Không dùng `Exam.assignedUsers[]`, `User.assignedExams[]` hoặc điểm do client gửi để thay thế các entity nghiệp vụ.
- Các attempt giữ snapshot/version của exam và question để lịch sử không đổi khi nội dung gốc được sửa.

Luồng dữ liệu chính:

```text
Subject/Topic
    ↓
QuestionBank → Question
    ↓             ↓
    └──────────→ Exam
                   ↓
            ExamAssignment
                   ↓
                Attempt → Answer → Result/EXP

Subject
    ↓
VocabularyBank → VocabularyEntry
    ↓
VocabularyAssignment
    ↓
StudentVocabularyCard (SRS)
```

## Kiến trúc runtime

```text
Trình duyệt ──► frontend (Next.js 14 App Router, port 3000)
                  │  fetch + cookie session HttpOnly (credentials: 'include')
                  ▼
               backend (Express 4 + TypeScript, port 4000)
                  │  @supabase/supabase-js (service role), không dùng ORM
                  ▼
               Supabase PostgreSQL          Cloudinary (ảnh)      SMTP (email mời / reset)
```

- Backend deploy trên Render (gói Free). Workflow `.github/workflows/keep-backend-awake.yml` ping `GET /api/health` vào buổi tối giờ Việt Nam để server không ngủ (cần repository variable `BACKEND_URL`).
- Frontend gọi API qua `NEXT_PUBLIC_API_BASE_URL` (mặc định `http://localhost:4000`).

### Phân tầng backend

Một request đi qua các tầng:

1. `app.ts` — `helmet`, `cors` (`FRONTEND_ORIGIN`, `credentials: true`), `express.json`, `cookieParser`, sau đó middleware toàn cục:
   - `authMiddleware`: đọc cookie session, resolve session và user, gắn `req.auth` (bỏ qua user `disabled` hoặc đang `locked`).
   - `enforcePasswordChangeGate`: user có `mustChangePassword` chỉ được gọi `change-password`, `logout`, `me` và các endpoint auth công khai.
2. `routes/*.routes.ts` — khai báo endpoint, `requireAuth` / `requireRole(...)`, parse body bằng Zod schema trong `validators/`, rồi gọi service.
3. `modules/<feature>/*.service.ts` — nghiệp vụ: quyền sở hữu, chuyển trạng thái, snapshot, chấm điểm, EXP. Logic thuần được tách file riêng (`grading.logic.ts`, `srs.logic.ts`, `random.selection.ts`, `question.validation.ts`).
4. `repositories/*.repository.ts` — truy vấn Supabase qua client singleton `db.ts`; `*.mapper.ts` chuyển row snake_case sang type domain.
5. `services/` — hạ tầng dùng chung: email, password hash, session, upload Cloudinary, sinh username.
6. Lỗi: service ném `AppError(status, message, code)` (`domain/errors.ts`); `middleware/errorHandler.ts` trả `{ error: { message, code } }`.

Một số route admin đơn giản (`users.routes.ts`) gọi thẳng repository thay vì qua module riêng.

## Cấu trúc thư mục

```
TestArchive/
├── package.json                    # Workspace scripts: dev, build, lint, typecheck
├── README.md                       # Hướng dẫn nhanh
├── SETUP.md                        # Hướng dẫn chạy local / deploy
├── .env.example
├── .gitignore
├── .github/workflows/
│   └── keep-backend-awake.yml      # Ping /api/health giữ Render không ngủ
├── doc/                            # Đặc tả nghiệp vụ và kỹ thuật
│   ├── README.md
│   ├── overview.md
│   ├── structure.md
│   ├── api.md
│   ├── database.md                 # Schema legacy (tham chiếu lịch sử)
│   ├── database-target.md          # Schema hiện hành
│   ├── migration-legacy.md         # Lộ trình deprecate quizzes (đã hoàn tất trong code)
│   └── features/                   # Đặc tả từng feature
├── frontend/                       # Next.js 14 App Router + React 18 + Tailwind + KaTeX
│   ├── package.json
│   ├── next.config.mjs
│   ├── tailwind.config.js
│   ├── postcss.config.js
│   ├── tsconfig.json
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── globals.css
│   │   ├── page.tsx                    # Landing/điều hướng
│   │   ├── login/page.tsx
│   │   ├── change-password/page.tsx    # Bắt buộc đổi mật khẩu tạm
│   │   ├── forgot-password/page.tsx
│   │   ├── reset-password/page.tsx
│   │   ├── dashboard/page.tsx          # Assignment và làm bài
│   │   ├── topics/page.tsx             # Quản lý chủ đề (taxonomy)
│   │   ├── questions/
│   │   │   ├── page.tsx                # Danh sách, lọc câu hỏi
│   │   │   ├── new/page.tsx
│   │   │   └── [id]/page.tsx           # Sửa, review, lifecycle
│   │   ├── question-banks/page.tsx
│   │   ├── exams/
│   │   │   ├── page.tsx
│   │   │   ├── new/page.tsx
│   │   │   └── [id]/
│   │   │       ├── edit/page.tsx       # Composer: section, câu, điểm, publish
│   │   │       └── results/page.tsx
│   │   ├── classes/page.tsx
│   │   ├── assignments/
│   │   │   ├── page.tsx                # Teacher giao đề
│   │   │   └── [id]/attempts/page.tsx
│   │   ├── attempts/[id]/page.tsx      # Làm bài theo snapshot
│   │   ├── results/
│   │   │   ├── page.tsx
│   │   │   └── [id]/page.tsx           # Kết quả attempt
│   │   ├── students/[id]/results/page.tsx
│   │   ├── grading/
│   │   │   ├── page.tsx                # Queue chấm thủ công
│   │   │   └── [attemptId]/page.tsx
│   │   ├── leaderboard/page.tsx
│   │   ├── vocabulary/
│   │   │   ├── page.tsx                # Teacher: bộ từ + giao SRS
│   │   │   └── review/page.tsx         # Student: ôn flashcard
│   │   └── admin/
│   │       ├── page.tsx
│   │       └── users/page.tsx          # Mời và quản lý tài khoản
│   ├── components/
│   │   ├── auth/                       # AppHeader, AuthGate
│   │   ├── questions/                  # QuestionForm, ContentBlocksEditor, TopicPicker, ...
│   │   ├── exams/                      # ExamComposer, ExamPreviewModal, BulkQuestionTextImport
│   │   ├── assignments/                # WeeklyAssignmentSummary
│   │   ├── attempts/                   # AttemptQuestionCard, AttemptListTable
│   │   └── analytics/                  # StatsPanel
│   ├── lib/
│   │   ├── api-client.ts               # api<T>() + hàm typed cho từng endpoint, ApiError
│   │   ├── auth.ts                     # useSession và helper session phía UI
│   │   ├── validation.ts               # Form validation, không thay thế backend
│   │   ├── latex.ts                    # Render LaTeX (KaTeX)
│   │   ├── bulk-question-text.ts       # Parse nhập câu hỏi hàng loạt từ text
│   │   ├── topics.ts
│   │   └── attempt-labels.ts
│   ├── constants/                      # tags.ts (môn học), questions.ts
│   ├── types/                          # auth.ts, content.ts — DTO cho UI (khai báo riêng, không share với backend)
│   └── tests/                          # Unit tests (*.test.ts)
├── backend/                            # Express + TypeScript API (ESM, tsx khi dev)
│   ├── package.json
│   ├── tsconfig.json
│   ├── test/                           # Unit tests (*.test.ts)
│   └── src/
│       ├── server.ts                   # Bootstrap HTTP server
│       ├── app.ts                      # Middleware và route registry
│       ├── config/env.ts
│       ├── middleware/
│       │   ├── auth.ts                 # authMiddleware, requireAuth, enforcePasswordChangeGate
│       │   ├── requireRole.ts          # RBAC
│       │   ├── errorHandler.ts
│       │   └── rateLimit.ts
│       ├── routes/
│       │   ├── auth.routes.ts          # /api/auth
│       │   ├── users.routes.ts         # /api/admin/users
│       │   ├── taxonomy.routes.ts      # /api/subjects, /api/topics
│       │   ├── questions.routes.ts     # /api/questions
│       │   ├── questionBanks.routes.ts # /api/question-banks
│       │   ├── exams.routes.ts         # /api/exams
│       │   ├── classes.routes.ts       # /api/classes
│       │   ├── assignments.routes.ts   # /api/exam-assignments
│       │   ├── attempts.routes.ts      # /api/attempts
│       │   ├── grading.routes.ts       # /api/grading
│       │   ├── leaderboard.routes.ts   # /api/leaderboard, /api/admin/exp
│       │   ├── students.routes.ts      # /api/students (me/assignments, me/vocabulary, me/exp, ...)
│       │   ├── vocabulary.routes.ts    # /api/vocabulary-banks, -entries, -assignments, -cards
│       │   └── upload.routes.ts        # /api/upload, /api/media
│       ├── modules/
│       │   ├── auth/                   # Login, invite, reset/đổi mật khẩu
│       │   ├── taxonomy/               # Topic CRUD + rule gắn topic vào câu hỏi
│       │   ├── questions/              # CRUD, validation, lifecycle
│       │   ├── question-banks/         # Filter và random selection
│       │   ├── exams/                  # Section, ordering, publish, generate
│       │   ├── classes/                # Lớp và thành viên
│       │   ├── assignments/            # Giao đề, deadline, attempt limit
│       │   ├── attempts/               # Snapshot, answer, submit
│       │   ├── grading/                # Auto/manual grading
│       │   ├── exp/                    # Ghi EXP idempotent vào exp_ledger
│       │   ├── leaderboard/            # Aggregate và tie-break
│       │   ├── analytics/              # Thống kê câu hỏi / đề / lớp / học sinh
│       │   └── vocabulary/             # Bộ từ, giao bộ từ, SRS (srs.logic.ts)
│       ├── services/                   # email, password, session, upload, username
│       ├── repositories/               # Truy vấn Supabase + mapper
│       ├── domain/errors.ts            # AppError
│       ├── validators/                 # Zod schema request
│       └── types/domain.ts             # Entity, enum, TagKey dùng chung backend
└── supabase/
    ├── README.md
    ├── migrations/                     # Migration tăng dần, không sửa lịch sử
    │   ├── 20260906000000_init_target_schema.sql
    │   ├── 20260906180000_add_users_username.sql
    │   ├── 20260908230000_allow_unlimited_exam_duration.sql
    │   └── 20260924120000_vocabulary_srs.sql
    ├── seed.sql                        # Subjects, demo users, class, sample question
    └── schema.sql                      # Snapshot schema hiện hành
```

Unit test: `backend/test/*.test.ts`, `frontend/tests/*.test.ts` (`npm test`). Chưa có suite integration/e2e đầy đủ. `npm run lint` của backend hiện chỉ chạy `tsc --noEmit`.

## Phân chia database

| Nhóm | Bảng chính | Trách nhiệm |
| :--- | :--- | :--- |
| Identity | `users`, `sessions`, `auth_tokens` | Tài khoản, session, invite/reset token |
| Taxonomy | `subjects`, `topics`, `question_topic_links` | Môn học, chủ đề và liên kết câu hỏi–chủ đề |
| Media | `media` | Metadata ảnh đã upload lên Cloudinary |
| Questions | `questions`, `question_options`, `question_banks`, `question_bank_items`, `question_stats` | Nội dung, metadata, lifecycle, quan hệ bank và thống kê |
| Exams | `exams`, `exam_sections`, `exam_questions` | Cấu trúc đề, thứ tự và điểm |
| Distribution | `classes`, `class_members`, `exam_assignments` | Giao cho student/class và setting riêng |
| Attempts | `attempts`, `attempt_answers`, `attempt_snapshots` | Lịch sử làm bài, câu trả lời và snapshot |
| Results | `grading_records`, `exp_ledger`, `leaderboard_periods` | Chấm tự động/thủ công, ghi EXP idempotent và mùa xếp hạng |
| Vocabulary | `vocabulary_entries`, `vocabulary_banks`, `vocabulary_bank_items`, `vocabulary_assignments`, `student_vocabulary_cards`, `vocabulary_review_events` | Bộ từ, giao bộ từ, trạng thái SRS per student và lịch sử ôn |

Chi tiết field: [database-target.md](database-target.md). Schema legacy `quizzes` chỉ còn trong [database.md](database.md) để tham chiếu lịch sử; code và migration hiện tại không dùng.

## Mapping feature → module

| Feature | Frontend | Backend | Dữ liệu |
| :--- | :--- | :--- | :--- |
| Authentication & Authorization | `app/login`, `app/change-password`, `app/forgot-password`, `app/reset-password`, `app/admin/users`, `components/auth` | `modules/auth`, `routes/users`, `middleware` | `users`, `sessions`, `auth_tokens` |
| Taxonomy (Subject/Topic) | `app/topics`, `components/questions/TopicPicker` | `modules/taxonomy`, `routes/taxonomy` | `subjects`, `topics`, `question_topic_links` |
| Question Management | `app/questions` | `modules/questions` | `questions`, `question_options` |
| Question Bank | `app/question-banks` | `modules/question-banks` | `question_banks`, `question_bank_items` |
| Exam Management | `app/exams`, `components/exams` | `modules/exams` | `exams`, `exam_sections`, `exam_questions` |
| Class Management | `app/classes` | `modules/classes` | `classes`, `class_members` |
| Exam Distribution | `app/assignments` | `modules/assignments` | `exam_assignments` |
| Dashboard & Attempt | `app/dashboard`, `app/attempts`, `app/results` | `modules/attempts`, `routes/students` | `attempts`, `attempt_answers`, snapshots |
| Manual Grading | `app/grading` | `modules/grading` | `grading_records`, `attempt_answers` |
| Media Upload | (question editor) | `routes/upload`, `services/upload` | `media` |
| Analytics | `components/analytics/StatsPanel`, `app/exams/[id]/results`, `app/students/[id]/results` | `modules/analytics` | `question_stats`, tính từ attempts |
| EXP & Leaderboard | `app/leaderboard` | `modules/exp`, `modules/leaderboard` | `exp_ledger`, `leaderboard_periods` |
| Vocabulary SRS | `app/vocabulary`, `app/vocabulary/review` | `modules/vocabulary`, `routes/vocabulary`, `routes/students` | `vocabulary_*`, `student_vocabulary_cards` |
## Trạng thái triển khai

Đã có code cho toàn bộ feature trong bảng trên, bao gồm auth/RBAC, question/bank, exam, class, assignment, attempt + snapshot, chấm tự động/thủ công, EXP ledger, leaderboard theo mùa, analytics và vocabulary SRS. Endpoint legacy `/api/quizzes` đã bị loại bỏ.

Việc còn mở:

- Test integration cho quyền truy cập và trạng thái nghiệp vụ, test e2e cho luồng login → giao đề → làm bài → kết quả.
- Lint thực sự cho backend (hiện chỉ typecheck).

Các rule bảo mật không được chỉ kiểm tra ở frontend.
