# Setup & chạy dự án TestArchive

Hướng dẫn dựng môi trường local theo bước 1 lộ trình trong [doc/structure.md](doc/structure.md): workspace, Supabase schema, auth/session/RBAC.

## Yêu cầu

- Node.js **20+** và npm
- Tài khoản [Supabase](https://supabase.com) (hoặc Postgres tương thích) để apply migration
- (Tuỳ chọn) SMTP để gửi email invite / reset — không có SMTP thì nội dung email in ra console backend

## 1. Clone và cài dependency

```bash
cd TestArchive
npm install
```

Workspace npm: `test-archive-workspace` (`frontend` + `backend`).

## 2. Database

Apply schema đích rồi seed demo:

```bash
# Thay DATABASE_URL bằng connection string Postgres của project Supabase
psql "$DATABASE_URL" -f supabase/migrations/20260906000000_init_target_schema.sql
# Nếu DB đã apply init cũ (chưa có username):
psql "$DATABASE_URL" -f supabase/migrations/20260906180000_add_users_username.sql
psql "$DATABASE_URL" -f supabase/seed.sql
```

Hoặc dùng Supabase CLI (`supabase db reset`) nếu đã cấu hình `config.toml`. Chi tiết: [supabase/README.md](supabase/README.md).

### Tài khoản demo (sau seed)

| Email | Username | Role | Mật khẩu |
| :--- | :--- | :--- | :--- |
| `admin@testarchive.local` | `admin` | admin | `ChangeMe123!` |
| `teacher@testarchive.local` | `teacher` | teacher | `ChangeMe123!` |
| `student1@testarchive.local` | `student1` | student | `ChangeMe123!` |
| `student2@testarchive.local` | `student2` | student | `ChangeMe123!` |

Seed đặt `must_change_password = true` → sau lần đăng nhập đầu tiên app bắt buộc đổi mật khẩu. Có thể đăng nhập bằng email hoặc username.

## 3. Biến môi trường

Sao chép mẫu:

```bash
cp .env.example backend/.env
cp .env.example frontend/.env.local
```

### Backend (`backend/.env`) — bắt buộc

| Biến | Ý nghĩa |
| :--- | :--- |
| `SUPABASE_URL` | URL project, ví dụ `https://xxxx.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (chỉ dùng server, không đưa vào frontend) |
| `FRONTEND_ORIGIN` | `http://localhost:3000` |
| `PORT` | `4000` |

Lấy URL và service role key trong Supabase Dashboard → **Project Settings → API**.

### Frontend (`frontend/.env.local`)

```env
NEXT_PUBLIC_API_BASE_URL=http://localhost:4000
```

Các biến SMTP trong `.env.example` là tuỳ chọn.

## 4. Chạy dev

Hai terminal:

```bash
npm run dev:backend
```

```bash
npm run dev:frontend
```

- Frontend: http://localhost:3000  
- API: http://localhost:4000  
- Health: http://localhost:4000/api/health  

## 5. Kiểm tra auth nhanh

1. Mở http://localhost:3000/login
2. Đăng nhập `admin` hoặc `admin@testarchive.local` / `ChangeMe123!`
3. Đổi mật khẩu khi được yêu cầu → đăng nhập lại
4. Vào `/admin/users` để mời tài khoản mới (mật khẩu tạm hiện trong console backend nếu chưa cấu hình SMTP)
5. Thử `/api/auth/me` qua cookie session (browser DevTools → Application → Cookies `ta_session`)

### API auth đã có

| Method | Path |
| :--- | :--- |
| `POST` | `/api/auth/login` |
| `POST` | `/api/auth/logout` |
| `GET` | `/api/auth/me` |
| `POST` | `/api/auth/change-password` |
| `POST` | `/api/auth/forgot-password` |
| `POST` | `/api/auth/reset-password` |
| `GET/POST/PATCH` | `/api/admin/users…` (admin) |

Spec: [doc/features/authentication-and-authorization.md](doc/features/authentication-and-authorization.md).

## 6. Classes, giao đề & upload (bước 4)

Sau khi có đề `published`:

1. Teacher đăng nhập → `/classes` — tạo/sửa lớp, thêm học sinh bằng email
2. `/assignments` — chọn exam published + lớp (hoặc UUID student) → giao đề
3. Student đăng nhập → `/dashboard` xem assignment của mình
4. (Tuỳ chọn) `POST /api/upload` multipart field `file` — ảnh JPEG/PNG/WebP ≤ 2MB; không cấu hình Cloudinary thì dùng placeholder HTTPS local

### API distribution / media

| Method | Path |
| :--- | :--- |
| `GET/POST/PATCH/DELETE` | `/api/classes…`, `…/members` |
| `GET` | `/api/students/me/classes`, `/api/students/me/assignments` |
| `POST` | `/api/exams/:id/assign`, `/api/exam-assignments` |
| `GET/PATCH` | `/api/exam-assignments/:id` |
| `POST` | `/api/exam-assignments/:id/cancel` |
| `POST` | `/api/upload` |
| `GET/DELETE` | `/api/media/:id` |

Spec: [class-management.md](doc/features/class-management.md), [exam-distribution.md](doc/features/exam-distribution.md), [media-upload.md](doc/features/media-upload.md).

## 7. Lỗi thường gặp

| Hiện tượng | Cách xử lý |
| :--- | :--- |
| Backend thoát ngay khi start | Thiếu `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` trong `backend/.env` |
| Login 401 dù đúng mật khẩu | Chưa chạy `seed.sql`, hoặc hash/seed trên DB khác |
| CORS / cookie không gửi | `FRONTEND_ORIGIN` phải khớp origin frontend; client gọi API với `credentials: 'include'` |
| Login ok nhưng `/me` 401 (Vercel+Render) | Set `COOKIE_SECURE=true` trên Render (cookie dùng `SameSite=None`); `FRONTEND_ORIGIN` = URL Vercel chính xác |
| Invite không nhận email | Bình thường nếu chưa SMTP — xem log `[email:dev-fallback]` trên backend |
| `403 Password change required` | Hoàn tất `/change-password` trước khi gọi API khác |
| Giao đề 422 `EXAM_NOT_PUBLISHED` | Publish exam trên `/exams` trước |
| Giao đề 403 student not in class | Thêm học sinh vào lớp teacher sở hữu |
| Upload không Cloudinary | OK local — log `[upload:dev-fallback]`; production cần `CLOUDINARY_*` |

## Cấu trúc code (auth + content + distribution)

```text
backend/src/
  modules/auth/
  modules/questions/
  modules/question-banks/
  modules/exams/
  modules/classes/
  modules/assignments/
  routes/classes.routes.ts
  routes/assignments.routes.ts
  routes/students.routes.ts
  routes/upload.routes.ts
  services/upload.service.ts

frontend/
  app/questions/
  app/question-banks/
  app/exams/
  app/classes/
  app/assignments/
  app/dashboard/          # student: danh sách assignment
```

Bước tiếp theo theo lộ trình: Attempt snapshot, submit, auto/manual grading (bước 5 trong `doc/structure.md`).
