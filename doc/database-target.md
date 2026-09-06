# Database — Schema đích

Schema mô tả **mô hình đích** sau migrate. Schema legacy (`quizzes`, …) xem [database.md](./database.md).

Types TypeScript dự kiến: `backend/types/domain.ts`. Migration: `supabase/migrations/`.

## Identity

### `users`

| Cột | Kiểu | Mô tả |
| :--- | :--- | :--- |
| `id` | uuid PK | |
| `email` | citext unique | Đăng nhập |
| `display_name` | text nullable | Tên hiển thị (leaderboard, UI); fallback UI → local-part của email |
| `password_hash` | text | |
| `role` | text | `admin` \| `teacher` \| `student` |
| `status` | text | `invited` \| `active` \| `locked` \| `disabled` |
| `must_change_password` | boolean | |
| `temporary_password_expires_at` | timestamptz | |
| `failed_login_attempts` | int | |
| `locked_until` | timestamptz | |
| `email_verified_at` | timestamptz | |
| `last_login_at` | timestamptz | |
| `math_exp` | int | **Projection** từ `exp_ledger`; default 0 |
| `lang_exp` | int | Projection |
| `flang_exp` | int | Projection |
| `sci_exp` | int | Projection |
| `hist_geo_exp` | int | Projection |
| `civic_exp` | int | Projection |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

### `sessions`

| Cột | Kiểu | Mô tả |
| :--- | :--- | :--- |
| `id` | uuid PK | |
| `user_id` | uuid FK → users | |
| `token_hash` | text unique | Hash session token (cookie) |
| `expires_at` | timestamptz | |
| `revoked_at` | timestamptz nullable | |
| `created_at` | timestamptz | |

### `auth_tokens`

Invite / reset password — giống [database.md](./database.md#bảng-auth_tokens).

## Taxonomy

### `subjects`

| Cột | Kiểu | Mô tả |
| :--- | :--- | :--- |
| `id` | text PK | `TagKey`: `math`, `lang`, … |
| `label` | text | Nhãn UI |

### `topics`

| Cột | Kiểu | Mô tả |
| :--- | :--- | :--- |
| `id` | uuid PK | |
| `subject_id` | text FK → subjects | |
| `name` | text | |
| `grade` | int nullable | Lớp áp dụng, nếu có |
| `created_at` | timestamptz | |

## Questions

### `questions`

| Cột | Kiểu | Mô tả |
| :--- | :--- | :--- |
| `id` | uuid PK | |
| `type` | text | Loại câu MVP/mở rộng |
| `subject_id` | text FK → subjects | |
| `grade` | int | |
| `difficulty` | text | `easy` \| `medium` \| `hard` |
| `content` | jsonb | Rich content blocks |
| `answer` | jsonb | |
| `explanation` | jsonb | |
| `points` | numeric | Điểm mặc định |
| `tags` | text[] | Nhãn tự do |
| `status` | text | `draft` \| `review` \| `published` \| `archived` |
| `version` | int | Tăng khi publish |
| `created_by` | uuid FK → users | |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

### `question_options`

| Cột | Kiểu | Mô tả |
| :--- | :--- | :--- |
| `id` | text | Option id trong câu (A, B, …) |
| `question_id` | uuid FK | |
| `content` | jsonb | |
| `order` | int | |

### `question_topic_links`

| Cột | Kiểu | Mô tả |
| :--- | :--- | :--- |
| `question_id` | uuid FK | |
| `topic_id` | uuid FK → topics | PK composite |

### `question_banks`

| Cột | Kiểu | Mô tả |
| :--- | :--- | :--- |
| `id` | uuid PK | |
| `name` | text | |
| `description` | text | |
| `subject_id` | text FK | |
| `grade` | int | |
| `owner_id` | uuid FK → users | |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

### `question_bank_items`

| Cột | Kiểu | Mô tả |
| :--- | :--- | :--- |
| `bank_id` | uuid FK | |
| `question_id` | uuid FK | PK composite |

## Exams

### `exams`

| Cột | Kiểu | Mô tả |
| :--- | :--- | :--- |
| `id` | uuid PK | |
| `title` | text | |
| `description` | text | |
| `subject_id` | text FK | |
| `grade` | int | |
| `type` | text | `practice`, `quiz`, … |
| `difficulty` | text | |
| `duration` | int | Phút; timer attempt |
| `total_points` | numeric | |
| `instructions` | text | |
| `settings` | jsonb | Default shuffle/showResult/… |
| `status` | text | `draft` \| `published` \| `archived` |
| `version` | int | Tăng khi publish |
| `created_by` | uuid FK | |
| `owner_id` | uuid FK | |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

### `exam_sections`

| Cột | Kiểu | Mô tả |
| :--- | :--- | :--- |
| `id` | uuid PK | |
| `exam_id` | uuid FK | |
| `title` | text | |
| `description` | text | |
| `order` | int | |

### `exam_questions`

| Cột | Kiểu | Mô tả |
| :--- | :--- | :--- |
| `exam_id` | uuid FK | |
| `section_id` | uuid FK nullable | |
| `question_id` | uuid FK | |
| `order` | int | |
| `points` | numeric | Override điểm trên đề |

## Distribution

### `classes`

| Cột | Kiểu | Mô tả |
| :--- | :--- | :--- |
| `id` | uuid PK | |
| `name` | text | Ví dụ "8A1" |
| `grade` | int | |
| `owner_id` | uuid FK → users | Teacher quản lý |
| `created_at` | timestamptz | |

### `class_members`

| Cột | Kiểu | Mô tả |
| :--- | :--- | :--- |
| `class_id` | uuid FK | |
| `user_id` | uuid FK → users (student) | PK composite |
| `joined_at` | timestamptz | |

### `exam_assignments`

Mỗi bản ghi **luôn** `target_type = 'user'` sau khi giao (kể cả giao theo lớp — expand Strategy B).

| Cột | Kiểu | Mô tả |
| :--- | :--- | :--- |
| `id` | uuid PK | |
| `exam_id` | uuid FK | |
| `target_type` | text | MVP: `'user'` |
| `target_id` | uuid FK → users | Student nhận đề |
| `source_class_id` | uuid FK nullable | Lớp gốc nếu tạo từ bulk assign class |
| `assigned_by` | uuid FK → users | |
| `assigned_at` | timestamptz | |
| `available_from` | timestamptz | |
| `deadline` | timestamptz | |
| `attempt_limit` | int | ≥ 1 |
| `status` | text | Assignment status |
| `settings` | jsonb | Override exam settings |
| `created_at` | timestamptz | |

## Attempts & Results

### `attempts`

| Cột | Kiểu | Mô tả |
| :--- | :--- | :--- |
| `id` | uuid PK | |
| `assignment_id` | uuid FK → exam_assignments | |
| `user_id` | uuid FK | |
| `exam_id` | uuid FK | Denormalized |
| `exam_version` | int | Snapshot version |
| `status` | text | Attempt status |
| `started_at` | timestamptz | |
| `submitted_at` | timestamptz nullable | |
| `expires_at` | timestamptz nullable | `started_at + Exam.duration` |
| `score` | numeric nullable | |
| `max_score` | numeric | |
| `percentage` | numeric nullable | |

### `attempt_snapshots`

| Cột | Kiểu | Mô tả |
| :--- | :--- | :--- |
| `attempt_id` | uuid PK FK | |
| `payload` | jsonb | Exam structure + question content đã strip answer key |

### `attempt_answers`

| Cột | Kiểu | Mô tả |
| :--- | :--- | :--- |
| `id` | uuid PK | |
| `attempt_id` | uuid FK | |
| `question_id` | uuid FK | |
| `value` | jsonb | |
| `is_correct` | boolean nullable | |
| `points_earned` | numeric nullable | |
| `feedback` | text nullable | Teacher manual grade |
| `answered_at` | timestamptz | |

### `grading_records`

| Cột | Kiểu | Mô tả |
| :--- | :--- | :--- |
| `id` | uuid PK | |
| `attempt_id` | uuid FK | |
| `graded_by` | uuid FK → users | |
| `graded_at` | timestamptz | |
| `notes` | text nullable | |

## EXP

### `exp_ledger`

Nguồn truth cho EXP. Unique `(attempt_id)`.

| Cột | Kiểu | Mô tả |
| :--- | :--- | :--- |
| `id` | uuid PK | |
| `attempt_id` | uuid FK unique | |
| `user_id` | uuid FK | |
| `subject_id` | text FK → subjects | |
| `exp_earned` | int | |
| `idempotency_key` | text unique nullable | |
| `created_at` | timestamptz | |

Projection `users.*_exp` cập nhật trong cùng transaction khi insert/adjust ledger.

## Quan hệ tóm tắt

```text
subjects → topics
users → question_banks → question_bank_items → questions
questions → exam_questions → exams
users → classes → class_members
exams → exam_assignments → attempts → attempt_answers
attempts → exp_ledger → (projection) users.*_exp
```

Chi tiết nghiệp vụ: [features/_cross-cutting.md](./features/_cross-cutting.md).
