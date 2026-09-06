# TestArchive

Hệ thống tạo câu hỏi, ngân hàng đề và phân phối bài học cho học sinh THCS.

- **Tài liệu đặc tả:** [doc/README.md](doc/README.md)
- **Setup & chạy local:** [SETUP.md](SETUP.md)
- **Lộ trình triển khai:** [doc/structure.md](doc/structure.md)

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

**Bước 1 (đang có):** workspace monorepo, schema Supabase, auth (login/logout/me, đổi mật khẩu, forgot/reset, admin invite/RBAC), UI login & quản lý user.

Các bước tiếp theo (question bank → exam → assignment → attempt → EXP) chưa implement.
