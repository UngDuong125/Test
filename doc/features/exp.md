# Hệ thống EXP

## 1. Mục đích

EXP là điểm tiến trình theo môn, được cộng sau khi một `Attempt` được backend chấm. EXP dùng cho [bảng xếp hạng](./leaderboard.md), không thay thế `score`, `percentage` hoặc lịch sử kết quả của attempt.

## 2. Nguồn phát sinh EXP

EXP chỉ được tính sau khi:

- student submit một `Attempt` hợp lệ;
- backend đã xác thực answer và tính `score` theo `pointsEarned`;
- attempt đạt trạng thái `graded` hoặc trạng thái hoàn tất tự động theo rule của exam.

Không cộng EXP từ dữ liệu score do frontend gửi lên. Attempt `in_progress`, `cancelled`, `expired` chưa được chấm và attempt đang `needs_grading` không tạo EXP cho đến khi có kết quả cuối cùng.

## 3. Công thức chuẩn

Điểm nền của EXP là điểm đạt được trong attempt, không phải số câu đúng cố định:

```text
score      = Σ pointsEarned
percentage = score / maxScore * 100
expEarned  = expPolicy(exam, assignment, attempt)
```

### Policy theo `Exam.type` (MVP)

```text
baseExp = floor(score)
expEarned = applyTypePolicy(Exam.type, baseExp, percentage)
```

| `Exam.type` | `expEarned` (MVP) |
| :--- | :--- |
| `practice` | `baseExp` |
| `worksheet` | `baseExp` |
| `homework` | `floor(baseExp * 0.8)` |
| `quiz` | `percentage ≥ 80` → `floor(baseExp * 1.2)` ; ngược lại `baseExp` |
| `midterm` | `floor(baseExp * 1.5)` |
| `final` | `floor(baseExp * 2.0)` |

- Policy chạy **chỉ trên backend** khi attempt → `graded`.
- `expEarned` không âm; ceiling tùy chọn = `floor(maxScore * multiplier)` để tránh điểm bất thường.
- Không lấy `display_count` làm `maxScore` khi câu hỏi có `points` khác nhau.
- Assignment **không** override multiplier trong MVP (tránh phức tạp); có thể thêm sau qua `assignment.settings.expMultiplier`.

Mỗi attempt đã được chấm chỉ được ghi nhận EXP một lần. Việc submit lại, gọi retry hoặc gọi API lặp không được cộng trùng.

Ví dụ: quiz score 8/10 (80%) → `baseExp=8` → `floor(8 * 1.2) = 9`.

## 4. Ánh xạ môn → EXP

Môn của attempt lấy từ `Exam.subjectId` (= `TagKey`), không lấy tùy ý từ request của frontend.

### Nguồn lưu trữ

| Layer | Vai trò |
| :--- | :--- |
| `exp_ledger` | **Nguồn truth** — một bản ghi / attempt đã `graded`, unique `attempt_id` |
| `users.*_exp` | Projection/cache aggregate từ ledger; rebuild được |

Legacy (`PATCH /api/quizzes`, cập nhật trực tiếp `users.*_exp`): chỉ giai đoạn migrate.

### Projection cột user (cache)

| Tag (`TagKey`) | Cột projection |
| :--- | :--- |
| `math` | `math_exp` |
| `lang` | `lang_exp` |
| `flang` | `flang_exp` |
| `sci` | `sci_exp` |
| `hist_geo` | `hist_geo_exp` |
| `civic` | `civic_exp` |

Tag không hợp lệ phải bị từ chối hoặc được ánh xạ qua policy rõ ràng; không tự động dồn vào `math_exp`.

### Bản ghi `exp_ledger`

```json
{
  "id": "ledger_001",
  "attemptId": "attempt_001",
  "userId": "student_001",
  "subjectId": "math",
  "expEarned": 9,
  "examType": "quiz",
  "idempotencyKey": "attempt_001:graded",
  "createdAt": "..."
}
```

| Rule | Chi tiết |
| :--- | :--- |
| Unique | `(attempt_id)` — một dòng ledger / attempt |
| Insert | Chỉ khi attempt lần đầu → `graded` |
| Regrade | `UPDATE exp_earned` (+ δ projection); không INSERT mới |
| Admin adjust | Có thể INSERT dòng `attempt_id=null` với `reason` **hoặc** API riêng ghi `exp_adjustments` — MVP: `POST /api/admin/exp/adjust` cập nhật projection + audit, không bịa attempt |

Transaction gợi ý khi grade:

```text
BEGIN
  update attempt score/status
  upsert exp_ledger
  update users.<subject>_exp += delta
COMMIT
```

## 5. Quy tắc nghiệp vụ

1. Kết quả thuộc về từng `Attempt`; không dùng `Exam.highScore` hoặc kỷ lục toàn cục để quyết định EXP.
2. Score và EXP không được âm và không vượt quá giới hạn do policy/backend quy định.
3. Nếu teacher chấm lại attempt, ghi **điều chỉnh** vào `exp_ledger`: `exp_adjustment = newExpEarned - oldExpEarned`; cập nhật projection `users.*_exp` trong cùng transaction; không insert bản ghi ledger thứ hai cho cùng `attempt_id`.
4. Hủy assignment không xóa EXP của attempt đã hoàn tất.
5. Xóa hoặc sửa Exam không làm thay đổi EXP lịch sử của attempt vì attempt giữ snapshot/version.
6. Admin có thể reset hoặc điều chỉnh EXP qua một API quản trị có audit log; student không được tự sửa EXP.

### Ví dụ MVP

| Attempt | `score` | EXP môn | Ghi chú |
| :--- | ---: | ---: | :--- |
| User A đạt 8/10 (practice) | 8 | +8 | `practice` → `baseExp` |
| User A làm lại (attempt mới) 7/10 trên practice | 7 | +7 | `practice` → `baseExp` |
| User B quiz 8/10 (80%) | 8 | +9 | `floor(8 * 1.2)` |
| User C homework 10/10 | 10 | +8 | `floor(10 * 0.8)` |

## 6. UI và thông báo

- Dashboard hiển thị kết quả attempt và EXP nhận được sau khi backend trả về kết quả.
- Không hiển thị `high_score` toàn cục như thành tích cá nhân.
- Leaderboard hiển thị tổng EXP và EXP theo môn; không dùng leaderboard để thay thế trang kết quả chi tiết.
- Nếu attempt cần teacher chấm, UI hiển thị trạng thái chờ chấm thay vì thông báo EXP đã cộng.

## 7. API gợi ý

EXP được tạo như một phần của submit/grade, không nhận từ client:

```text
POST /api/attempts/:id/submit
POST /api/attempts/:id/grade
GET  /api/attempts/:id/result
GET  /api/students/:id/exp
```

Response kết quả có thể gồm:

```json
{
  "score": 8,
  "maxScore": 10,
  "percentage": 80,
  "expEarned": 8,
  "expSubject": "math",
  "status": "graded"
}
```

## 8. Tương thích / migrate

Xem lộ trình đầy đủ: [migration-legacy.md](../migration-legacy.md).

Tóm tắt: `PATCH /api/quizzes` + `high_score` là legacy; EXP mới chỉ từ attempt `graded` → `exp_ledger`.
