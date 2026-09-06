# Database (Supabase)

| Tài liệu / file | Nội dung |
| :--- | :--- |
| [database-target.md](./database-target.md) | Spec schema đích |
| [`supabase/migrations/`](../supabase/migrations/) | Migration SQL đích |
| [`supabase/seed.sql`](../supabase/seed.sql) | Seed local |
| [features/_cross-cutting.md](./features/_cross-cutting.md) | Quy ước chung |

Không dùng Prisma / ORM — truy vấn qua Supabase JS client với **service role**.

> **Lưu ý:** Phần dưới mô tả **schema legacy** (`quizzes`, câu hỏi nhúng JSONB) để tham chiếu migrate. Schema đích đã có SQL trong `supabase/` — không nhầm với snapshot đích `supabase/schema.sql`.

## Bảng `users`

| Cột | Kiểu | Mô tả |
| :--- | :--- | :--- |
| `id` | uuid PK | `uuid_generate_v4()` |
| `email` | citext unique | Định danh đăng nhập, unique không phân biệt hoa thường |
| `display_name` | text nullable | *(Schema đích)* Tên hiển thị — xem [database-target.md](./database-target.md) |
| `password_hash` | text | Hash mật khẩu, không lưu plaintext |
| `role` | text | `'admin'` \| `'teacher'` \| `'student'` (mặc định `student`) |
| `status` | text | `'invited'` \| `'active'` \| `'locked'` \| `'disabled'` |
| `must_change_password` | boolean | Mặc định `true` với tài khoản được tạo qua email |
| `temporary_password_expires_at` | timestamptz | Hạn sử dụng mật khẩu tạm |
| `failed_login_attempts` | int | Số lần đăng nhập sai liên tiếp |
| `locked_until` | timestamptz | Thời điểm hết khóa tạm, nếu có |
| `email_verified_at` | timestamptz | Thời điểm xác nhận email |
| `last_login_at` | timestamptz | Lần đăng nhập thành công gần nhất |
| `math_exp` | int | EXP Toán |
| `lang_exp` | int | EXP Ngôn ngữ |
| `flang_exp` | int | EXP Ngoại ngữ |
| `sci_exp` | int | EXP Khoa học |
| `hist_geo_exp` | int | EXP Lịch sử - Địa lý |
| `civic_exp` | int | EXP Giáo dục công dân |
| `created_at` | timestamptz | |

Seed mẫu nên dùng email admin đã xác nhận; không seed mật khẩu plaintext. Chi tiết luồng mời và mật khẩu tạm xem [Authentication & Authorization](features/authentication-and-authorization.md).

## Bảng `auth_tokens`

Dùng cho lời mời kích hoạt và đặt lại mật khẩu. Token phải được hash trước khi lưu.

| Cột | Kiểu | Mô tả |
| :--- | :--- | :--- |
| `id` | uuid PK | |
| `user_id` | uuid FK → `users.id` | Người nhận token |
| `token_hash` | text unique | Hash của token một lần |
| `type` | text | `'invite'` \| `'password_reset'` |
| `expires_at` | timestamptz | Thời hạn token |
| `used_at` | timestamptz | Null khi chưa dùng |
| `created_at` | timestamptz | |

## Bảng `quizzes`

| Cột | Kiểu | Mô tả |
| :--- | :--- | :--- |
| `id` | uuid PK | |
| `created_by` | uuid FK → `users.id` | `ON DELETE SET NULL` |
| `tag` | text | Key môn học |
| `quiz_title` | text | Tiêu đề đề |
| `question_count` | int | Tổng câu trong ngân hàng |
| `display_count` | int | Số câu mỗi lần làm |
| `category_display_counts` | jsonb | Quota theo category, ví dụ `{ "thucvat": 2 }` |
| `questions` | jsonb | Mảng object câu hỏi (không có bảng `questions` riêng) |
| `target_user_ids` | jsonb | Mảng UUID khi không global |
| `is_global` | boolean | Mặc định `true` |
| `high_score` | int | Kỷ lục điểm toàn cục (dùng tính EXP) |
| `is_published` | boolean | Mặc định `false` |
| `created_at` | timestamptz | |

## Object câu hỏi (trong `questions` jsonb)

```ts
{
  type: 'MCQ' | 'FILL';
  category: string;
  has_image: boolean;
  image_url: string;
  question_text: string;
  options: string[];   // MCQ
  answer: string;      // chữ cái A–D hoặc text FILL
  explanation: string;
}
```

## Quan hệ

```
users 1 ─── * quizzes          (created_by)
users * ←── soft link ── quizzes.target_user_ids  (jsonb UUID[])
```

- Câu hỏi **nhúng** trong `quizzes.questions`, không có bảng `questions` riêng (khác mô tả cũ trong `Architecture.md`).
- Không có bảng lưu lịch sử lần làm bài — chỉ giữ `high_score` trên đề và các cột EXP trên user.

## Biến môi trường liên quan DB

| Biến (backend) | Mục đích |
| :--- | :--- |
| `SUPABASE_URL` | URL project Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role (bắt buộc cho API) |
