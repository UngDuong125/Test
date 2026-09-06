# Migration Legacy → Mô hình đích (P3)

Tài liệu này định nghĩa lộ trình deprecate API/`quizzes` legacy và chuyển sang Attempt + `exp_ledger`. Không dùng endpoint legacy làm spec nghiệp vụ mới.

## 1. Mục tiêu

- Backend là nơi duy nhất chấm điểm và ghi EXP.
- Lịch sử làm bài nằm ở `Attempt` / `Answer`, không ở `quizzes.high_score`.
- Leaderboard đọc từ `exp_ledger` (hoặc projection rebuild từ ledger).
- Sau migrate: gỡ `PATCH /api/quizzes` nhận `score` từ client.

## 2. Mapping thực thể

| Legacy | Đích |
| :--- | :--- |
| `quizzes` | `exams` (+ `exam_sections`, `exam_questions`) |
| `quizzes.questions` (jsonb) | `questions` + `question_options` (+ bank items) |
| `quizzes.tag` | `exams.subject_id` (`TagKey`) |
| `quizzes.target_user_ids` / `is_global` | `exam_assignments` (per user; global → assign từng student hoặc bỏ) |
| `quizzes.high_score` | Bỏ; dùng `attempts.score` / thống kê từ attempt |
| `PATCH /api/quizzes` `{ score }` | `POST /api/attempts/:id/submit` (+ grade) |
| `GET /api/quizzes` | `GET /api/students/:id/assignments` + snapshot attempt |
| `users.*_exp` cập nhật trực tiếp | Insert/update `exp_ledger` → projection `users.*_exp` |
| `PATCH /api/admin/users` action-based | `/api/admin/users/:id/status`, `…/role` |

Chi tiết schema: [database.md](./database.md) (legacy), [database-target.md](./database-target.md) (đích).

## 3. Lộ trình theo phase

### Phase A — Dual-write (an toàn)

1. Thêm bảng đích (`exams`, `exam_assignments`, `attempts`, `exp_ledger`, …) cạnh `quizzes`.
2. Submit mới: ghi `Attempt` + `exp_ledger`; **đồng thời** cập nhật projection `users.*_exp`.
3. `GET /api/leaderboard` chuyển sang aggregate ledger (fallback projection nếu ledger trống).
4. Giữ `GET /api/quizzes` read-only cho client cũ; đánh dấu `Deprecation: true` trong response header `Sunset`.

### Phase B — Cutover write path

1. Frontend mới dùng `/api/exam-assignments` + `/api/attempts`.
2. `PATCH /api/quizzes` trả `410 Gone` hoặc proxy nội bộ sang submit attempt **chỉ** khi có cờ `LEGACY_QUIZ_PROXY=true`.
3. Ngừng tin `score` từ client: mọi proxy phải chấm lại từ answers (nếu legacy không có answers → từ chối ghi EXP).

### Phase C — Data migrate

1. Script: mỗi `quizzes` published → `exams` + questions tách (best-effort từ jsonb).
2. `target_user_ids` → `exam_assignments`.
3. Không tạo attempt giả từ `high_score` (không có lịch sử đủ tin).
4. Rebuild `users.*_exp` từ `exp_ledger` sau khi có dữ liệu attempt mới; đánh dấu EXP legacy là `source=legacy_import` nếu cần audit.

### Phase D — Remove

1. Xóa route `/api/quizzes`, `/api/admin/quizzes`.
2. Drop hoặc archive bảng `quizzes` sau backup.
3. Gỡ dual-write flags.

## 4. Quy tắc EXP khi migrate

| Tình huống | Hành vi |
| :--- | :--- |
| Attempt mới graded | Insert `exp_ledger`; cập nhật projection |
| Regrade | Điều chỉnh `exp_earned` trên cùng `attempt_id` |
| Admin reset EXP | Ghi ledger điều chỉnh + audit; rebuild projection |
| Dữ liệu chỉ có `users.*_exp` cũ | Giữ projection; không invent attempt; leaderboard all-time có thể lệch cho đến khi có attempt mới |

Admin API gợi ý:

```text
POST /api/admin/exp/rebuild-projections
POST /api/admin/exp/adjust   { userId, subjectId, delta, reason }
```

Chỉ `admin`; bắt buộc `reason` + audit log.

## 5. Deprecation headers (API)

Legacy responses nên gồm:

```http
Deprecation: true
Sunset: Sat, 01 Aug 2026 00:00:00 GMT
Link: </api/exam-assignments>; rel="successor-version"
```

Catalog thay thế: [api.md](./api.md#legacy-giai-đoạn-migrate--deprecate).

## 6. Acceptance Criteria

- Không còn đường ghi EXP tin `score` từ frontend khi Phase B xong.
- Leaderboard top-N và tie-break tính ở backend từ ledger/projection.
- Admin rebuild projection không làm mất audit ledger.
- Client mới không gọi `/api/quizzes` để làm bài.

## 7. Liên quan

- [exp.md](./features/exp.md)
- [leaderboard.md](./features/leaderboard.md)
- [overview.md](./overview.md#trạng-thái-implementation)
- [structure.md](./structure.md) — bước 7 lộ trình triển khai
