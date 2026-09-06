# Feature: Exam Management

## 1. Mục tiêu

Cho phép tạo một bộ đề từ Question Bank và quản lý cấu trúc, điểm số, thời lượng, trạng thái xuất bản.

## 2. Exam Model

```json
{
  "id": "exam_001",
  "title": "Ôn tập Toán 7 - Chương 1",
  "description": "...",
  "subjectId": "math",
  "grade": 7,
  "type": "practice",
  "difficulty": "medium",
  "duration": 45,
  "totalPoints": 10,
  "instructions": "...",
  "status": "draft",
  "createdBy": "teacher_001",
  "ownerId": "teacher_001",
  "createdAt": "...",
  "updatedAt": "..."
}
```

## 3. Exam Types

```text
practice
quiz
homework
worksheet
midterm
final
```

## 4. Section

```json
{
  "id": "section_001",
  "examId": "exam_001",
  "title": "Phần 1 - Trắc nghiệm",
  "description": "...",
  "order": 1
}
```

## 5. Exam Question

Không copy question vào exam. Dùng reference:

```json
{
  "examId": "exam_001",
  "sectionId": "section_001",
  "questionId": "question_001",
  "order": 1,
  "points": 0.5
}
```

Điều này cho phép cùng một question được sử dụng trong nhiều exam.

### Quy tắc điểm

- `Question.points`: điểm mặc định khi thêm câu vào exam.
- `ExamQuestion.points`: **override** trên đề cụ thể; backend dùng giá trị này khi chấm attempt.
- Nếu không set override, copy `Question.points` vào `ExamQuestion.points` lúc thêm câu.
- Khi publish: `Σ ExamQuestion.points` phải bằng `Exam.totalPoints` (sai lệch → `422`).

## 6. Thời lượng và timer

| Field | Ý nghĩa |
| :--- | :--- |
| `Exam.duration` | Thời lượng làm bài (phút). Timer đếm từ `Attempt.startedAt`. |
| `ExamAssignment.deadline` | Hạn **bắt đầu** attempt mới (xem [Exam Distribution](./exam-distribution.md)). |

Hành vi khi hết `duration`:

- Backend set `Attempt.expires_at = startedAt + duration`.
- Hết giờ: auto-submit nếu có answer, hoặc chuyển `expired`.
- Attempt đã bắt đầu trước `deadline` vẫn được nộp trong thời lượng còn lại (không bị deadline cắt giữa chừng trừ khi policy bổ sung).

Chi tiết: [\_cross-cutting.md](./_cross-cutting.md#timer-duration-vs-deadline).

## 7. Exam Settings (mặc định)

Exam chỉ giữ **giá trị mặc định** cho hiển thị và trộn câu; giá trị thực tế khi giao đề được đặt trên `ExamAssignment`:

```json
{
  "shuffleQuestions": false,
  "shuffleOptions": true,
  "showResult": true,
  "showExplanation": true
}
```

Không đặt `attemptLimit`, `availableFrom`, `deadline` hoặc đối tượng nhận đề trên `Exam` — các thuộc tính đó thuộc [Exam Distribution](./exam-distribution.md). Assignment có thể override các setting trên mà không sửa exam gốc.

## 8. Lifecycle

```text
draft
  ↓
published
  ↓
archived
```

Không nên cho sửa nội dung question làm thay đổi ngoài ý muốn các attempt cũ.

## 9. Snapshot Strategy

Khi học sinh bắt đầu làm đề, nên snapshot phiên bản cần thiết của exam/question hoặc lưu `version`.

Mục tiêu:

```text
Exam version 1
   ↓
Student starts attempt
   ↓
Teacher sửa question
   ↓
Attempt cũ vẫn giữ nội dung/version cũ
```

Không để việc chỉnh sửa question làm thay đổi lịch sử bài đã làm.

## 10. API gợi ý

```text
POST   /api/exams
GET    /api/exams/:id
PATCH  /api/exams/:id
DELETE /api/exams/:id

POST   /api/exams/:id/questions
DELETE /api/exams/:id/questions/:questionId

POST   /api/exams/:id/publish
POST   /api/exams/:id/archive
POST   /api/exams/:id/duplicate

POST   /api/exams/generate
```

## 11. Acceptance Criteria

- Tạo đề thủ công từ Question Bank.
- Sắp xếp câu hỏi theo section/order.
- Thay đổi điểm từng câu.
- Preview đề.
- Validate tổng điểm.
- Publish đề.
- Không cho published exam chứa câu hỏi không hợp lệ.
- Có thể duplicate đề.
