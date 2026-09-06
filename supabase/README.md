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
# Chỉ cần nếu DB đã apply bản init cũ (chưa có cột username):
psql "$DATABASE_URL" -f supabase/migrations/20260906180000_add_users_username.sql
psql "$DATABASE_URL" -f supabase/seed.sql
```

## Apply (Supabase CLI)

```bash
supabase db reset   # chạy migrations + seed nếu cấu hình trong config.toml
```

## Seed demo

| Email | Username | Role | Mật khẩu local |
| :--- | :--- | :--- | :--- |
| `admin@testarchive.local` | `admin` | admin | `ChangeMe123!` |
| `teacher@testarchive.local` | `teacher` | teacher | `ChangeMe123!` |
| `student1@testarchive.local` | `student1` | student | `ChangeMe123!` |
| `student2@testarchive.local` | `student2` | student | `ChangeMe123!` |

Đăng nhập bằng email hoặc username. Hash tạo bằng `pgcrypto.crypt()` trong `seed.sql` — không commit plaintext hash cố định. Đổi mật khẩu ngay trên môi trường dùng chung.
