# API & Routes

Quy ước API đích (naming, lỗi, idempotency): [features/_cross-cutting.md](./features/_cross-cutting.md).

## Trang frontend (Next.js App Router)

| Path | File | Mô tả |
| :--- | :--- | :--- |
| `/` | `frontend/app/page.tsx` | Landing |
| `/login` | `frontend/app/login/page.tsx` | Đăng nhập email hoặc username + mật khẩu |
| `/change-password` | `frontend/app/change-password/page.tsx` | Đổi mật khẩu (bắt buộc khi `mustChangePassword`) |
| `/forgot-password` | `frontend/app/forgot-password/page.tsx` | Quên mật khẩu |
| `/reset-password` | `frontend/app/reset-password/page.tsx` | Đặt lại mật khẩu từ token |
| `/dashboard` | `frontend/app/dashboard/page.tsx` | Danh sách assignment & làm bài |
| `/topics` | `frontend/app/topics/page.tsx` | Quản lý chủ đề (taxonomy) |
| `/questions` | `frontend/app/questions/page.tsx` | Danh sách / lọc câu hỏi |
| `/questions/new` | `frontend/app/questions/new/page.tsx` | Tạo câu hỏi |
| `/questions/[id]` | `frontend/app/questions/[id]/page.tsx` | Sửa, review, lifecycle |
| `/question-banks` | `frontend/app/question-banks/page.tsx` | Ngân hàng câu hỏi |
| `/attempts/[id]` | `frontend/app/attempts/[id]/page.tsx` | Làm bài theo snapshot |
| `/results` | `frontend/app/results/page.tsx` | Danh sách kết quả |
| `/results/[id]` | `frontend/app/results/[id]/page.tsx` | Kết quả attempt |
| `/students/[id]/results` | `frontend/app/students/[id]/results/page.tsx` | Kết quả theo học sinh |
| `/exams` | `frontend/app/exams/page.tsx` | Danh sách đề / generate |
| `/exams/new` | `frontend/app/exams/new/page.tsx` | Tạo đề nháp → composer |
| `/exams/[id]/edit` | `frontend/app/exams/[id]/edit/page.tsx` | Trình soạn đề tích hợp |
| `/exams/[id]/results` | `frontend/app/exams/[id]/results/page.tsx` | Kết quả theo đề |
| `/assignments` | `frontend/app/assignments/page.tsx` | Teacher giao đề |
| `/assignments/[id]/attempts` | `frontend/app/assignments/[id]/attempts/page.tsx` | Attempts của assignment |
| `/classes` | `frontend/app/classes/page.tsx` | Quản lý lớp + thành viên (cùng trang) |
| `/grading` | `frontend/app/grading/page.tsx` | Queue chấm thủ công |
| `/grading/[attemptId]` | `frontend/app/grading/[attemptId]/page.tsx` | Chấm một attempt |
| `/admin` | `frontend/app/admin/page.tsx` | Công cụ admin |
| `/admin/users` | `frontend/app/admin/users/page.tsx` | Mời và quản lý tài khoản |
| `/leaderboard` | `frontend/app/leaderboard/page.tsx` | Xếp hạng EXP |
| `/vocabulary` | `frontend/app/vocabulary/page.tsx` | Teacher: bộ từ + giao SRS |
| `/vocabulary/review` | `frontend/app/vocabulary/review/page.tsx` | Student: ôn flashcard |

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
| `GET` | `/api/admin/users` | `admin` |
| `POST` | `/api/admin/users/invite` | `admin` |
| `POST` | `/api/admin/users/:id/resend-invite` | `admin` |
| `PATCH` | `/api/admin/users/:id/status` | `admin` |
| `PATCH` | `/api/admin/users/:id/role` | `admin` |

### Questions, exams, assignments, attempts (đích)

| Nhóm | Endpoint chính | Feature doc |
| :--- | :--- | :--- |
| Questions | `POST/GET/PATCH /api/questions`, `…/submit-review`, `…/reject-review`, `…/publish`, `…/archive`, `…/duplicate` | [question-management.md](./features/question-management.md) |
| Question banks | `POST/GET /api/question-banks`, search | [question-bank.md](./features/question-bank.md) |
| Exams | `POST/GET/PATCH /api/exams`, `…/questions`, `…/questions/create`, `…/validate`, `…/publish`, `…/generate` | [exam-management.md](./features/exam-management.md) |
| Assignments | `POST/GET/PATCH /api/exam-assignments`, `POST /api/exams/:id/assign` | [exam-distribution.md](./features/exam-distribution.md) |
| Classes | `POST/GET/PATCH /api/classes`, `…/members`, `…/analytics` | [class-management.md](./features/class-management.md) |
| Attempts | `POST /api/exam-assignments/:id/attempts`, `PATCH /api/attempts/:id/answers`, `POST /api/attempts/:id/check` (chỉ đề `lesson`), `POST /api/attempts/:id/submit` | [attempt-and-result.md](./features/attempt-and-result.md) |
| Grading | `GET /api/grading/queue`, `GET /api/grading/:attemptId`, `POST /api/attempts/:id/grade`, `…/regrade` | [manual-grading.md](./features/manual-grading.md) |
| Student | `GET /api/students/me/assignments`, `GET /api/students/:id/assignments`, `GET /api/students/:id/results` | [dashboard.md](./features/dashboard.md) |
| Vocabulary SRS | `POST/GET /api/vocabulary-banks`, `/api/vocabulary-entries`, `/api/vocabulary-assignments` (+ cancel), `GET /api/students/me/vocabulary/due`, `POST /api/vocabulary-cards/:id/review` | [vocabulary-srs.md](./features/vocabulary-srs.md) |
| Leaderboard | `GET /api/leaderboard`, `?period=`, `/periods` | [leaderboard.md](./features/leaderboard.md) |
| Analytics | `GET /api/questions/:id/stats`, `…/exams/:id/analytics`, `…/classes/:id/analytics` | [analytics.md](./features/analytics.md) |
| Upload | `POST /api/upload`, `GET/DELETE /api/media/:id` | [media-upload.md](./features/media-upload.md) |
| Admin EXP | `POST /api/admin/exp/rebuild-projections`, `…/adjust` | [exp.md](./features/exp.md) |

### Legacy (đã loại bỏ)

> Các endpoint dưới đây **không còn tồn tại** trong backend; bảng chỉ giữ mapping sang endpoint thay thế để tham chiếu. Lộ trình cũ: [migration-legacy.md](./migration-legacy.md).

| Method | Endpoint | Thay thế đích | Trạng thái mục tiêu (cũ) |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/quizzes` | assignments + snapshot | Phase B: read-only + `Sunset` header |
| `PATCH` | `/api/quizzes` | `POST /api/attempts/:id/submit` + ledger | Phase B: `410` hoặc proxy có flag |
| `GET/PATCH/DELETE` | `/api/admin/quizzes` | `/api/exams`, assignments | Phase D: remove |
| `PATCH` | `/api/admin/users` (action) | `/api/admin/users/:id/status`, `…/role` | Phase B |

Mọi endpoint bảo vệ lấy danh tính từ session, không tin `userId` client gửi. `401` / `403` theo [\_cross-cutting.md](./features/_cross-cutting.md).
