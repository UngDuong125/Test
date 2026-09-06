# Feature: Attempt & Result

## 1. Mục tiêu

Quản lý mỗi lần học sinh làm một đề, câu trả lời, trạng thái nộp bài và kết quả.

## 2. Attempt Model

```json
{
  "id": "attempt_001",
  "assignmentId": "assignment_001",
  "userId": "student_001",
  "examId": "exam_001",

  "startedAt": "...",
  "submittedAt": null,

  "status": "in_progress",

  "score": null,
  "maxScore": 10,
  "percentage": null
}
```

## 3. Attempt Status

```text
in_progress
submitted
needs_grading
graded
expired
cancelled
```

Luồng chuyển trạng thái:

- Tự động chấm hoàn toàn: `in_progress` → `submitted` → `graded`.
- Có câu cần chấm thủ công: `in_progress` → `submitted` → `needs_grading` → `graded`.
- Hết thời gian hoặc hết hạn assignment: `in_progress` → `expired`.
- Hủy bởi hệ thống hoặc admin: `in_progress` → `cancelled`.

## 4. Answer Model

```json
{
  "id": "answer_001",
  "attemptId": "attempt_001",
  "questionId": "question_001",

  "value": "B",

  "isCorrect": true,
  "pointsEarned": 0.5,

  "answeredAt": "..."
}
```

## 5. Auto Grading

**MVP** — tự động chấm:

- `multiple_choice`
- `true_false`
- `fill_blank`
- Một số `short_answer` nếu exact match hoặc normalization

**Mở rộng** (khi bật trong môi trường): `multiple_select`, `numeric`, …

Không tự động chấm hoàn toàn:

- `essay`
- Một số `short_answer` cần đánh giá nội dung

Danh sách loại câu: [\_cross-cutting.md](./_cross-cutting.md#question-types--mvp-vs-mở-rộng), [question-management.md](./question-management.md).

## 6. Manual Grading

Khi attempt có câu cần chấm thủ công, trạng thái chuyển theo mục 3:

```text
submitted → needs_grading → graded
```

Teacher có thể:

- nhập điểm.
- đánh dấu đúng/sai.
- thêm feedback.

## 7. Score Calculation

```text
score = Σ pointsEarned
percentage = score / maxScore * 100
```

Không nên lấy điểm trực tiếp từ frontend.

Backend phải tính lại.

## 8. Snapshot

Attempt nên giữ:

- exam version.
- question version.
- nội dung cần thiết để hiển thị lịch sử.

Mục tiêu là kết quả cũ không thay đổi khi question/exam được sửa sau này.

## 9. Security

Frontend không được nhận answer key trước khi submit nếu exam yêu cầu kiểm tra nghiêm túc.

Backend phải là nơi:

```text
validate answer
calculate score
store result
```

## 10. API gợi ý

```text
POST   /api/exam-assignments/:id/attempts
GET    /api/attempts/:id
PATCH  /api/attempts/:id/answers
POST   /api/attempts/:id/submit

GET    /api/attempts/:id/result
POST   /api/attempts/:id/grade

GET    /api/students/:id/results
GET    /api/exams/:id/results
```

Quy ước naming: [\_cross-cutting.md](./_cross-cutting.md).

## 11. Acceptance Criteria

- Student có thể bắt đầu attempt hợp lệ.
- Không vượt quá attempt limit.
- Có thể lưu answer trong khi làm.
- Submit được một lần.
- Backend tự tính điểm.
- Câu tự luận có thể chờ teacher chấm.
- Kết quả lịch sử không thay đổi khi đề gốc được sửa.
