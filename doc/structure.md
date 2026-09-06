# Cấu trúc dự án

## Trạng thái repository hiện tại

Repository hiện chỉ chứa tài liệu đặc tả trong `doc/`. Các thư mục ứng dụng, database và cấu hình được mô tả ở phần **Cấu trúc đích** chưa tồn tại.

```
TestArchive/
└── doc/
    ├── README.md
    ├── api.md
    ├── database.md              # Schema legacy
    ├── database-target.md       # Schema đích
    ├── overview.md
    ├── structure.md
    └── features/
        ├── _cross-cutting.md
        ├── authentication-and-authorization.md
        ├── attempt-and-result.md
        ├── dashboard.md
        ├── exam-distribution.md
        ├── exam-management.md
        ├── exp.md
        ├── leaderboard.md
        ├── question-bank.md
        └── question-management.md
```

## Nguyên tắc kiến trúc

- Monorepo gồm `frontend`, `backend` và `supabase`.
- Frontend chỉ hiển thị UI và gọi API; không tự quyết định quyền, điểm hoặc EXP.
- Backend là nơi xác thực session, RBAC, kiểm tra quyền sở hữu, snapshot attempt, chấm điểm và ghi EXP.
- Database tách nội dung tái sử dụng (`Question`, `QuestionBank`) khỏi đề (`Exam`), phân phối (`ExamAssignment`) và lịch sử làm bài (`Attempt`, `Answer`).
- Không dùng `Exam.assignedUsers[]`, `User.assignedExams[]` hoặc điểm do client gửi để thay thế các entity nghiệp vụ.
- Các attempt phải giữ snapshot/version của exam và question để lịch sử không đổi khi nội dung gốc được sửa.

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
```

## Cấu trúc đích

```
TestArchive/
├── package.json                    # Workspace scripts
├── README.md                       # Hướng dẫn nhanh
├── .gitignore
├── doc/                            # Đặc tả nghiệp vụ và kỹ thuật
├── frontend/                       # Next.js App Router
│   ├── package.json
│   ├── next.config.mjs
│   ├── tsconfig.json
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── globals.css
│   │   ├── page.tsx                # Landing/điều hướng
│   │   ├── login/page.tsx
│   │   ├── dashboard/page.tsx       # Assignment và làm bài
│   │   ├── exams/page.tsx            # Danh sách/preview exam
│   │   ├── question-banks/page.tsx   # Quản lý ngân hàng câu hỏi
│   │   ├── questions/page.tsx        # Tạo, sửa, review question
│   │   ├── assignments/page.tsx      # Teacher giao đề
│   │   ├── attempts/[id]/page.tsx    # Làm bài theo snapshot
│   │   ├── results/[id]/page.tsx     # Kết quả attempt
│   │   ├── leaderboard/page.tsx
│   │   └── admin/
│   │       ├── page.tsx
│   │       └── users/page.tsx        # Mời và quản lý tài khoản
│   ├── components/                  # UI dùng chung
│   │   ├── auth/
│   │   ├── questions/
│   │   ├── exams/
│   │   ├── assignments/
│   │   └── attempts/
│   ├── lib/
│   │   ├── api-client.ts             # HTTP client, credentials/cookies
│   │   ├── auth.ts                   # Session và route guard phía UI
│   │   └── validation.ts              # Form validation, không thay thế backend
│   ├── constants/tags.ts
│   └── types/                        # DTO/type cho UI
├── backend/                          # Express + TypeScript API
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── server.ts                 # Bootstrap Express
│       ├── app.ts                    # Middleware và route registry
│       ├── config/env.ts
│       ├── middleware/
│       │   ├── auth.ts               # Đọc session/token
│       │   ├── requireRole.ts        # RBAC
│       │   ├── errorHandler.ts
│       │   └── rateLimit.ts
│       ├── routes/
│       │   ├── auth.routes.ts
│       │   ├── users.routes.ts
│       │   ├── questions.routes.ts
│       │   ├── questionBanks.routes.ts
│       │   ├── exams.routes.ts
│       │   ├── assignments.routes.ts
│       │   ├── attempts.routes.ts
│       │   ├── leaderboard.routes.ts
│       │   └── upload.routes.ts
│       ├── modules/
│       │   ├── auth/                 # Login, invite, reset password
│       │   ├── users/                # User admin và quyền
│       │   ├── questions/            # CRUD, validation, lifecycle
│       │   ├── question-banks/       # Filter và random selection
│       │   ├── exams/                # Section, ordering, publish
│       │   ├── assignments/          # Giao đề, deadline, attempt limit
│       │   ├── attempts/             # Snapshot, answer, submit
│       │   ├── grading/              # Auto/manual grading
│       │   ├── exp/                  # Idempotent EXP policy
│       │   └── leaderboard/          # Aggregate và tie-break
│       ├── services/
│       │   ├── email.service.ts
│       │   ├── upload.service.ts
│       │   └── session.service.ts
│       ├── repositories/             # Truy vấn Supabase/PostgreSQL
│       ├── domain/                   # Entity, enum, policy, error
│       ├── validators/               # Zod/schema request
│       └── types/                    # DTO và type dùng chung backend
├── supabase/
│   ├── migrations/                   # Migration tăng dần, không sửa lịch sử
│   ├── seed.sql
│   └── schema.sql                    # Snapshot schema dễ dựng môi trường mới
└── tests/
    ├── integration/                  # API + database
    └── e2e/                          # Login, giao đề, làm bài, kết quả
```

## Phân chia database

Schema nên có các nhóm bảng sau:

| Nhóm | Bảng chính | Trách nhiệm |
| :--- | :--- | :--- |
| Identity | `users`, `sessions`, `auth_tokens` | Tài khoản, session, invite/reset token |
| Taxonomy | `subjects`, `topics` | Môn học và chủ đề |
| Questions | `questions`, `question_options`, `question_banks`, `question_bank_items` | Nội dung, metadata, lifecycle và quan hệ bank |
| Exams | `exams`, `exam_sections`, `exam_questions` | Cấu trúc đề, thứ tự và điểm |
| Distribution | `classes`, `class_members`, `exam_assignments` | Giao cho student/class và setting riêng |
| Attempts | `attempts`, `attempt_answers`, `attempt_snapshots` | Lịch sử làm bài, câu trả lời và snapshot |
| Results | `grading_records`, `exp_ledger` | Chấm tự động/thủ công và ghi EXP idempotent |

Chi tiết field schema đích: [database-target.md](database-target.md). Schema legacy: [database.md](database.md). Schema legacy `quizzes.questions`, `target_user_ids`, `is_global` và `high_score` chỉ nên được giữ trong giai đoạn migrate, không dùng làm mô hình đích.

## Mapping feature → module

| Feature | Frontend | Backend | Dữ liệu |
| :--- | :--- | :--- | :--- |
| Authentication & Authorization | `app/login`, `components/auth` | `modules/auth`, `middleware` | `users`, `sessions`, `auth_tokens` |
| Question Management | `app/questions` | `modules/questions` | `questions`, `question_options` |
| Question Bank | `app/question-banks` | `modules/question-banks` | `question_banks`, `question_bank_items` |
| Exam Management | `app/exams` | `modules/exams` | `exams`, `exam_sections`, `exam_questions` |
| Distribution | `app/assignments` | `modules/assignments` | `exam_assignments`, `classes`, `class_members` |
| Dashboard & Attempt | `app/dashboard`, `app/attempts`, `app/results` | `modules/attempts`, `modules/grading` | `attempts`, `attempt_answers`, snapshots |
| EXP & Leaderboard | `app/leaderboard` | `modules/exp`, `modules/leaderboard` | `exp_ledger` |

## Lộ trình triển khai

1. Dựng workspace, frontend, backend và Supabase migration; hoàn thiện auth, session và RBAC.
2. Xây `Question`/`QuestionBank`, validation, upload media và lifecycle publish.
3. Xây `Exam`, section, chọn câu thủ công/random và publish validation.
4. Xây `ExamAssignment`, class membership và kiểm tra quyền truy cập student.
5. Xây `Attempt` snapshot, lưu answer, submit, auto/manual grading và result.
6. Ghi EXP theo ledger có idempotency, sau đó xây leaderboard từ ledger.
7. Migrate dữ liệu legacy `quizzes` và loại bỏ các endpoint cập nhật score/EXP từ frontend.

Mỗi bước cần có test integration cho quyền truy cập và trạng thái nghiệp vụ; các rule bảo mật không được chỉ kiểm tra ở frontend.
