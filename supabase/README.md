# Supabase / PostgreSQL

Schema đích theo [doc/database-target.md](../doc/database-target.md). Legacy `quizzes` không nằm trong migration này.

## Cấu trúc

| Path | Mục đích |
| :--- | :--- |
| `migrations/` | Migration tăng dần (không sửa file đã apply) |
| `seed.sql` | Dữ liệu mẫu local (subjects, users demo, class, 1 câu hỏi) |
| `schema.sql` | Bootstrap greenfield (include migration init) |

## Apply (psql)

```bash
psql "$DATABASE_URL" -f supabase/migrations/20260906000000_init_target_schema.sql
psql "$DATABASE_URL" -f supabase/seed.sql
```

## Apply (Supabase CLI)

```bash
supabase db reset   # chạy migrations + seed nếu cấu hình trong config.toml
```

## Seed demo

| Email | Role | Mật khẩu local |
| :--- | :--- | :--- |
| `admin@testarchive.local` | admin | `ChangeMe123!` |
| `teacher@testarchive.local` | teacher | `ChangeMe123!` |
| `student1@testarchive.local` | student | `ChangeMe123!` |
| `student2@testarchive.local` | student | `ChangeMe123!` |

Hash tạo bằng `pgcrypto.crypt()` trong `seed.sql` — không commit plaintext hash cố định. Đổi mật khẩu ngay trên môi trường dùng chung.
