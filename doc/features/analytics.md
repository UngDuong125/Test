# Feature: Analytics

## 1. Mục tiêu

Cung cấp thống kê đọc được cho teacher/admin: độ khó thực tế của câu hỏi, kết quả theo đề/lớp, hỗ trợ cải thiện ngân hàng câu hỏi. Analytics **tính từ Attempt đã graded**, không tin score frontend.

Không thay thế trang kết quả từng attempt; không lộ answer key học sinh khác.

## 2. Actor

| Role | Phạm vi |
| :--- | :--- |
| `teacher` | Câu hỏi/đề mình sở hữu; lớp mình quản lý |
| `admin` | Toàn hệ thống |
| `student` | Chỉ thống kê cá nhân tối thiểu (điểm/EXP của mình) — không phải focus MVP |

## 3. Question usage stats

Nguồn: `attempt_answers` join `attempts` (`status=graded`).

```json
{
  "questionId": "question_001",
  "usageCount": 120,
  "attemptCount": 120,
  "correctRate": 0.68,
  "averagePointsEarned": 0.7,
  "averageTimeSeconds": 43,
  "difficultyObserved": "medium"
}
```

| Metric | Công thức gợi ý |
| :--- | :--- |
| `usageCount` | Số lần câu xuất hiện trong attempt graded |
| `correctRate` | `count(is_correct=true) / count(answered)` (null `is_correct` với essay dùng ngưỡng điểm) |
| `averageTimeSeconds` | Trung bình `(answered_at - attempt.started_at)` per question nếu có telemetry; MVP có thể bỏ |
| `difficultyObserved` | Map từ `correctRate`: &gt;0.75 easy, 0.4–0.75 medium, &lt;0.4 hard |

**Lưu trữ:** tính on-the-fly hoặc materialize `question_stats` (rebuild định kỳ). Không copy stats khi duplicate question ([question-bank.md](./question-bank.md)).

## 4. Exam / assignment / class

### Theo exam

```json
{
  "examId": "exam_001",
  "attemptCount": 85,
  "gradedCount": 80,
  "needsGradingCount": 5,
  "averageScore": 7.2,
  "averagePercentage": 72,
  "completionRate": 0.94
}
```

### Theo class (`sourceClassId`)

```json
{
  "classId": "class_8a1",
  "examId": "exam_001",
  "assignedCount": 32,
  "completedCount": 28,
  "averagePercentage": 70,
  "expTotal": 210
}
```

`expTotal` = Σ `exp_ledger.exp_earned` của attempt thuộc assignment có `source_class_id`.

## 5. API

| Method | Endpoint | Mục đích | Quyền |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/questions/:id/stats` | Usage một câu | Owner question / admin |
| `GET` | `/api/question-banks/:id/stats` | Tổng hợp câu trong bank | Owner bank / admin |
| `GET` | `/api/exams/:id/analytics` | Thống kê đề | Owner exam / admin |
| `GET` | `/api/classes/:id/analytics?examId=` | Thống kê lớp × đề | Class owner / admin |
| `GET` | `/api/students/me/stats` | Tóm tắt cá nhân (optional) | `student` |

Query chung: `from`, `to` (ISO datetime) để giới hạn cửa sổ thời gian attempt.

## 6. Privacy

- Không trả nội dung answer của student khác trong analytics aggregate.
- Danh sách điểm từng học sinh trong lớp: endpoint riêng (`/api/classes/:id/results`) — xem [manual-grading.md](./manual-grading.md), cần quyền class owner.
- Rate-limit các endpoint nặng.

## 7. Acceptance Criteria

- Teacher xem được `correctRate` / `usageCount` của câu mình.
- Analytics đề phản ánh attempt `graded`, không tính `in_progress`.
- Duplicate question không mang stats cũ.
- Student không gọi được stats câu hỏi của đề người khác (`403`).

## 8. File liên quan

| Layer | Path |
| :--- | :--- |
| Backend | `modules/analytics` hoặc aggregate trong questions/exams/classes |
| Question bank | [question-bank.md](./question-bank.md) |
| Class | [class-management.md](./class-management.md) |
| EXP | [exp.md](./exp.md) |
| Schema | `attempt_answers`, optional `question_stats` |
