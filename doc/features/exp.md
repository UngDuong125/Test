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

MVP có thể dùng chính `score` làm EXP:

```text
expEarned = floor(score)
```

Nếu hệ thống muốn thưởng theo phần trăm hoặc độ khó, policy phải được định nghĩa ở backend và áp dụng nhất quán. Không lấy `display_count` làm `maxScore` khi câu hỏi có `points` khác nhau.

Mỗi attempt đã được chấm chỉ được ghi nhận EXP một lần. Việc submit lại, gọi retry hoặc gọi API lặp không được cộng trùng.

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
| User A đạt 8/10 | 8 | +8 | Ghi nhận một lần |
| User A làm lại (attempt mới) 7/10 | 7 | +7 | Mỗi attempt được chấm ghi EXP riêng; không so sánh với attempt trước |
| User B đạt 10/10 | 10 | +10 | Ghi vào môn của Exam |

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

## 8. Tương thích với implementation hiện tại

Implementation hiện tại vẫn cộng EXP qua `PATCH /api/quizzes` bằng cách so sánh `quizzes.high_score` và tin `score` từ frontend. Đây là logic legacy cần migrate:

- `quizzes.high_score` → kết quả của từng `Attempt`;
- `{ quizId, userId, tag, score }` → submit/grade attempt;
- chấm điểm frontend → validate và calculate ở backend;
- cộng EXP theo phần vượt kỷ lục → policy EXP trên kết quả attempt;
- update quiz rồi user tuần tự → transaction hoặc cơ chế idempotency/audit.

Trong giai đoạn chuyển tiếp, không dùng `high_score` để suy ra lịch sử attempt hoặc thành tích cá nhân.
