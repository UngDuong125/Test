# TestArchive

Hệ thống tạo câu hỏi, ngân hàng đề và phân phối bài học cho học sinh THCS.

- **Tài liệu đặc tả:** [doc/README.md](doc/README.md)
- **Setup & chạy local:** [SETUP.md](SETUP.md)
- **Kiến trúc & cấu trúc:** [doc/structure.md](doc/structure.md)

## Tech stack

| Layer | Stack |
| :--- | :--- |
| Frontend | Next.js 14 (App Router), React 18, Tailwind — port **3000** |
| Backend | Express + TypeScript — port **4000** |
| Database | Supabase / PostgreSQL (`supabase/migrations`) |

## Quick start

```bash
npm install
cp .env.example backend/.env
cp .env.example frontend/.env.local
# Điền SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY, apply migration + seed (xem SETUP.md)
npm run dev:backend
npm run dev:frontend
```

## Trạng thái implementation

Đã triển khai mô hình đích trong `doc/`:

- Auth (login/logout/me, đổi mật khẩu, forgot/reset, admin invite/RBAC)
- Question bank, exam composer, class, giao đề, attempt + snapshot, chấm tự động/thủ công
- EXP (`exp_ledger`) + leaderboard (all-time / seasonal)
- Vocabulary SRS (flashcard 1/3/7/14/30 ngày)

Chi tiết: [doc/overview.md](doc/overview.md). Test unit: `npm test` (workspace / `backend` / `frontend`).
