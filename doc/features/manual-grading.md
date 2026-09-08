# Feature: Manual Grading

## 1. Mục tiêu

Cho phép teacher/admin chấm các câu không tự động chấm hết (chủ yếu `essay`, một số `short_answer`), hoàn tất attempt `needs_grading` → `graded`, ghi feedback và kích hoạt EXP.

Tách khỏi [attempt-and-result.md](./attempt-and-result.md) (luồng student submit/auto-grade) để rõ actor và queue chấm.

## 2. Actor

| Role | Quyền |
| :--- | :--- |
| `teacher` | Chấm attempt thuộc exam mình sở hữu hoặc student trong lớp mình quản lý |
| `admin` | Chấm mọi attempt |
| `student` | Chỉ xem feedback sau khi `showResult` / assignment cho phép |

## 3. Khi nào vào `needs_grading`

Sau `POST /api/attempts/:id/submit`:

1. Backend auto-grade các câu đủ điều kiện.
2. Nếu còn câu `essay` hoặc `short_answer` đánh dấu `requiresManualGrade` → status = `needs_grading`.
3. Nếu không còn câu thủ công → status = `graded` và ghi EXP ngay.

Partial score (điểm đã auto-grade) có thể lưu tạm trên attempt; `percentage` / EXP chỉ chốt khi `graded`.

```text
submit
  → auto-grade MVP types
  → còn câu thủ công? ──yes──→ needs_grading
                     └──no───→ graded (+ exp_ledger)
```

## 4. Grading Model

### Request chấm từng câu

```json
{
  "answers": [
    {
      "questionId": "question_essay_01",
      "pointsEarned": 1.5,
      "isCorrect": null,
      "feedback": "Lập luận đúng nhưng thiếu đơn vị."
    }
  ],
  "notes": "Đã chấm phần tự luận"
}
```

### Ràng buộc

- `0 ≤ pointsEarned ≤ ExamQuestion.points` (điểm trên snapshot/đề).
- Chỉ chấm câu còn pending manual trên attempt đó.
- Attempt phải `needs_grading` (hoặc `graded` nếu regrade — xem mục 6).
- Không tin `score`/`percentage` do client gửi; backend tính lại:

```text
score      = Σ pointsEarned (auto + manual)
percentage = score / maxScore * 100
```

### `grading_records`

Mỗi lần hoàn tất chấm (hoặc regrade) ghi audit:

```json
{
  "id": "grade_001",
  "attemptId": "attempt_001",
  "gradedBy": "teacher_001",
  "gradedAt": "...",
  "notes": "..."
}
```

## 5. Teacher workflow

```text
Grading queue
   ↓
Lọc theo exam / class / subject
   ↓
Mở attempt needs_grading
   ↓
Xem snapshot câu hỏi + câu trả lời student
   ↓
Nhập điểm + feedback từng câu
   ↓
Submit grade → graded + EXP
```

UI path gợi ý: `/grading` (queue), `/grading/[attemptId]` (chi tiết).

## 6. Regrade

- Teacher có thể mở lại attempt đã `graded` trong cửa sổ regrade (MVP: luôn cho phép owner/admin).
- Cập nhật `pointsEarned` / feedback; tính lại `score` / `percentage`.
- EXP: điều chỉnh ledger theo [exp.md](./exp.md) — `exp_adjustment = newExpEarned - oldExpEarned` trên cùng `attempt_id`, không insert ledger trùng.

## 7. Hiển thị kết quả cho student

| Điều kiện | Student thấy |
| :--- | :--- |
| `needs_grading` | Trạng thái chờ chấm; không EXP; có thể thấy điểm tạm auto nếu `showResult` |
| `graded` + `showResult` | `score`, `percentage`, feedback từng câu (nếu có), đúng/sai |
| `showExplanation` + hết lượt (`remainingAttempts = 0`) | Đáp án + lời giải từ snapshot |
| `showExplanation` nhưng còn lượt | Chỉ đúng/sai / điểm — **không** lộ đáp án/lời giải |

## 8. API

| Method | Endpoint | Mục đích | Quyền |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/grading/queue` | Danh sách attempt `needs_grading` | `teacher`, `admin` |
| `GET` | `/api/attempts/:id` | Chi tiết attempt + answers (có quyền) | Owner exam / admin |
| `POST` | `/api/attempts/:id/grade` | Chấm / hoàn tất manual grade | Owner exam / admin |
| `POST` | `/api/attempts/:id/regrade` | Chấm lại attempt đã graded | Owner exam / admin |
| `GET` | `/api/exams/:id/results` | Kết quả theo đề | Owner / admin |
| `GET` | `/api/classes/:id/results` | Kết quả theo lớp (assignments có `sourceClassId`) | Class owner / admin |

### Query queue

```text
GET /api/grading/queue?examId=&classId=&subjectId=&limit=20
```

### Response sau grade

```json
{
  "attemptId": "attempt_001",
  "status": "graded",
  "score": 8.5,
  "maxScore": 10,
  "percentage": 85,
  "expEarned": 8,
  "expSubject": "math"
}
```

## 9. Acceptance Criteria

- Essay không được auto `graded` mà không qua teacher (trừ khi exam không có câu manual).
- Teacher chỉ thấy queue trong phạm vi exam/lớp mình.
- Hoàn tất grade chuyển `needs_grading` → `graded` và ghi EXP một lần.
- Regrade điều chỉnh EXP đúng policy, không cộng trùng.
- Student thấy feedback theo setting assignment.

## 10. File liên quan

| Layer | Path |
| :--- | :--- |
| UI | `frontend/app/grading/` |
| Backend | `backend/src/modules/grading/` |
| Attempt | [attempt-and-result.md](./attempt-and-result.md) |
| EXP | [exp.md](./exp.md) |
| Class | [class-management.md](./class-management.md) |
| Schema | `grading_records`, `attempt_answers` trong [database-target.md](../database-target.md) |
