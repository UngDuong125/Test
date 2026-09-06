# API & Routes

Quy ước API đích (naming, lỗi, idempotency): [features/_cross-cutting.md](./features/_cross-cutting.md).

## Trang frontend (Next.js App Router)

| Path | File | Mô tả |
| :--- | :--- | :--- |
| `/` | `frontend/app/page.tsx` | Landing |
| `/login` | `frontend/app/login/page.tsx` | Đăng nhập email hoặc username + mật khẩu |
| `/dashboard` | `frontend/app/dashboard/page.tsx` | Danh sách assignment & làm bài |
| `/attempts/[id]` | `frontend/app/attempts/[id]/page.tsx` | Làm bài theo snapshot |
| `/results/[id]` | `frontend/app/results/[id]/page.tsx` | Kết quả attempt |
| `/exams` | `frontend/app/exams/page.tsx` | Danh sách đề / generate |
| `/exams/new` | `frontend/app/exams/new/page.tsx` | Tạo đề nháp → composer |
| `/exams/[id]/edit` | `frontend/app/exams/[id]/edit/page.tsx` | Trình soạn đề tích hợp |
| `/assignments` | `frontend/app/assignments/page.tsx` | Teacher giao đề |
| `/classes` | `frontend/app/classes/page.tsx` | Quản lý lớp |
| `/grading` | `frontend/app/grading/page.tsx` | Queue chấm thủ công |
| `/admin` | `frontend/app/admin/page.tsx` | Công cụ admin |
| `/leaderboard` | `frontend/app/leaderboard/page.tsx` | Xếp hạng EXP |

Base URL API phía client: `NEXT_PUBLIC_API_BASE_URL` (mặc định `http://localhost:4000`), helper tại `frontend/lib/api-client.ts`.

## Backend Express (`backend/src/server.ts`)

CORS: `FRONTEND_ORIGIN` (mặc định `http://localhost:3000`). Giới hạn body JSON: **2mb**.

### Auth (đích)

| Method | Endpoint | Body / Query | Kết quả |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/auth/login` | `{ login, password }` (`login` = email hoặc username; cũng chấp nhận `email` / `username`) | Session cookie + user/role |
| `POST` | `/api/auth/logout` | — | Hủy session |
| `GET` | `/api/auth/me` | — | User hiện tại |
| `POST` | `/api/auth/change-password` | `{ currentPassword, newPassword }` | Đổi mật khẩu |
| `POST` | `/api/auth/forgot-password` | `{ email }` | Gửi email reset |
| `POST` | `/api/auth/reset-password` | `{ token, newPassword }` | Đặt mật khẩu mới |

Chi tiết: [authentication-and-authorization.md](./features/authentication-and-authorization.md).

### Admin users (đích)

| Method | Endpoint | Quyền |
| :--- | :--- | :--- |
| `POST` | `/api/admin/users/invite` | `admin` |
| `POST` | `/api/admin/users/:id/resend-invite` | `admin` |
| `PATCH` | `/api/admin/users/:id/status` | `admin` |
| `PATCH` | `/api/admin/users/:id/role` | `admin` |

### Questions, exams, assignments, attempts (đích)

| Nhóm | Endpoint chính | Feature doc |
| :--- | :--- | :--- |
| Questions | `POST/GET/PATCH /api/questions`, `…/publish` | [question-management.md](./features/question-management.md) |
| Question banks | `POST/GET /api/question-banks`, search | [question-bank.md](./features/question-bank.md) |
| Exams | `POST/GET/PATCH /api/exams`, `…/questions`, `…/questions/create`, `…/validate`, `…/publish`, `…/generate` | [exam-management.md](./features/exam-management.md) |
| Assignments | `POST/GET/PATCH /api/exam-assignments`, `POST /api/exams/:id/assign` | [exam-distribution.md](./features/exam-distribution.md) |
| Classes | `POST/GET/PATCH /api/classes`, `…/members` | [class-management.md](./features/class-management.md) |
| Attempts | `POST /api/exam-assignments/:id/attempts`, `POST /api/attempts/:id/submit` | [attempt-and-result.md](./features/attempt-and-result.md) |
| Grading | `GET /api/grading/queue`, `POST /api/attempts/:id/grade` | [manual-grading.md](./features/manual-grading.md) |
| Student | `GET /api/students/:id/assignments` | [dashboard.md](./features/dashboard.md) |
| Leaderboard | `GET /api/leaderboard`, `?period=`, `/periods` | [leaderboard.md](./features/leaderboard.md) |
| Analytics | `GET /api/questions/:id/stats`, `…/exams/:id/analytics` | [analytics.md](./features/analytics.md) |
| Upload | `POST /api/upload` | [media-upload.md](./features/media-upload.md) |
| Admin EXP | `POST /api/admin/exp/rebuild-projections`, `…/adjust` | [migration-legacy.md](./migration-legacy.md) |

### Legacy (giai đoạn migrate — deprecate)

> Không dùng làm spec nghiệp vụ mới. Lộ trình A→D: [migration-legacy.md](./migration-legacy.md).

| Method | Endpoint | Thay thế đích | Trạng thái mục tiêu |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/quizzes` | assignments + snapshot | Phase B: read-only + `Sunset` header |
| `PATCH` | `/api/quizzes` | `POST /api/attempts/:id/submit` + ledger | Phase B: `410` hoặc proxy có flag |
| `GET/PATCH/DELETE` | `/api/admin/quizzes` | `/api/exams`, assignments | Phase D: remove |
| `PATCH` | `/api/admin/users` (action) | `/api/admin/users/:id/status`, `…/role` | Phase B |
| `GET` | `/api/leaderboard` | Giữ path; nguồn = `exp_ledger` + `period` | Phase A |

Mọi endpoint bảo vệ lấy danh tính từ session, không tin `userId` client gửi. `401` / `403` theo [\_cross-cutting.md](./features/_cross-cutting.md).
