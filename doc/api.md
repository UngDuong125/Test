# API & Routes

Quy ước API đích (naming, lỗi, idempotency): [features/_cross-cutting.md](./features/_cross-cutting.md).

## Trang frontend (Next.js App Router)

| Path | File | Mô tả |
| :--- | :--- | :--- |
| `/` | `frontend/app/page.tsx` | Landing |
| `/login` | `frontend/app/login/page.tsx` | Đăng nhập email + mật khẩu |
| `/dashboard` | `frontend/app/dashboard/page.tsx` | Danh sách assignment & làm bài |
| `/attempts/[id]` | `frontend/app/attempts/[id]/page.tsx` | Làm bài theo snapshot |
| `/results/[id]` | `frontend/app/results/[id]/page.tsx` | Kết quả attempt |
| `/assignments` | `frontend/app/assignments/page.tsx` | Teacher giao đề |
| `/admin` | `frontend/app/admin/page.tsx` | Công cụ admin |
| `/leaderboard` | `frontend/app/leaderboard/page.tsx` | Xếp hạng EXP |

Base URL API phía client: `NEXT_PUBLIC_API_BASE_URL` (mặc định `http://localhost:4000`), helper tại `frontend/lib/api-client.ts`.

## Backend Express (`backend/src/server.ts`)

CORS: `FRONTEND_ORIGIN` (mặc định `http://localhost:3000`). Giới hạn body JSON: **2mb**.

### Auth (đích)

| Method | Endpoint | Body / Query | Kết quả |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/auth/login` | `{ email, password }` | Session cookie + user/role |
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
| Exams | `POST/GET/PATCH /api/exams`, `…/publish`, `…/generate` | [exam-management.md](./features/exam-management.md) |
| Assignments | `POST/GET/PATCH /api/exam-assignments`, `POST /api/exams/:id/assign` | [exam-distribution.md](./features/exam-distribution.md) |
| Attempts | `POST /api/exam-assignments/:id/attempts`, `POST /api/attempts/:id/submit` | [attempt-and-result.md](./features/attempt-and-result.md) |
| Student | `GET /api/students/:id/assignments` | [dashboard.md](./features/dashboard.md) |
| Leaderboard | `GET /api/leaderboard`, `GET /api/students/:id/exp` | [leaderboard.md](./features/leaderboard.md) |
| Upload | `POST /api/upload` | Cloudinary signed upload |

### Legacy (giai đoạn migrate — deprecate)

> Các endpoint dưới đây map từ implementation cũ. Không dùng làm spec nghiệp vụ mới.

| Method | Endpoint | Thay thế đích |
| :--- | :--- | :--- |
| `GET` | `/api/quizzes` | `GET /api/students/:id/assignments` + exam snapshot |
| `PATCH` | `/api/quizzes` | `POST /api/attempts/:id/submit` + `exp_ledger` |
| `GET/PATCH/DELETE` | `/api/admin/quizzes` | `/api/exams`, `/api/exam-assignments` |
| `PATCH` | `/api/admin/users` (action-based) | `/api/admin/users/:id/status`, `…/role` |
| `GET` | `/api/leaderboard` | Giữ path; đổi nguồn dữ liệu sang `exp_ledger` |

Mọi endpoint bảo vệ lấy danh tính từ session, không tin `userId` client gửi. `401` / `403` theo [\_cross-cutting.md](./features/_cross-cutting.md).
