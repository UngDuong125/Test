# Quy ước chung (Cross-cutting)

Tài liệu này là nguồn tham chiếu cho naming, trạng thái, lỗi API và quy ước dùng chung giữa các feature. Các file feature phải tuân theo quy ước tại đây.

## API naming

- Mọi endpoint đích dùng prefix **`/api/`**.
- Resource phân phối đề: **`exam-assignments`** (không rút gọn thành `assignments`).
- Nested resource attempt:

```text
POST /api/exam-assignments/:id/attempts
```

- Danh sách assignment của student:

```text
GET /api/students/me/assignments
GET /api/students/:id/assignments   # teacher/admin, có kiểm tra quyền
```

- `:id` trong path luôn là UUID server-side; client không gửi `userId` thay cho session.

## Taxonomy (Subject / Topic)

```text
subjects (TagKey: math, lang, …)
   └── topics (id, subject_id, name, grade?)
        └── question_bank_items → questions
```

- **`subjectId`** trên `Question`, `QuestionBank`, `Exam` = key trong bảng `subjects` (= `TagKey`).
- **`topicIds`** trên `Question` = FK tới `topics.id`; không trùng với `tags` (nhãn tự do, ví dụ `"algebra"`).
- `QuestionBank` lọc theo `subjectId` + `grade`; câu hỏi có thể thuộc nhiều bank qua `question_bank_items`.

## Trạng thái

| Entity | Giá trị | Ghi chú |
| :--- | :--- | :--- |
| User | `invited`, `active`, `locked`, `disabled` | |
| Question | `draft`, `review`, `published`, `archived` | |
| Exam | `draft`, `published`, `archived` | |
| ExamAssignment | `assigned`, `available`, `in_progress`, `completed`, `expired`, `cancelled` | Suy ra theo rule trong [exam-distribution.md](./exam-distribution.md#5-assignment-status) |
| Attempt | `in_progress`, `submitted`, `needs_grading`, `graded`, `expired`, `cancelled` | |

## Timer: duration vs deadline

| Khái niệm | Nguồn | Ý nghĩa |
| :--- | :--- | :--- |
| **Thời lượng làm bài** | `Exam.duration` (phút) | Timer đếm ngược từ `Attempt.startedAt`; hết giờ → auto-submit hoặc `expired` |
| **Hạn nộp** | `ExamAssignment.deadline` | Không cho **bắt đầu** attempt mới sau deadline; attempt đang `in_progress` vẫn được nộp trong grace period ngắn nếu đã start trước deadline |
| **Thời gian mở** | `ExamAssignment.availableFrom` | Không hiển thị / không cho start trước thời điểm này |

## Điểm câu hỏi

- `Question.points`: điểm mặc định khi thêm câu vào exam.
- `ExamQuestion.points`: **override** trên từng đề; giá trị này dùng khi chấm attempt.
- Khi publish exam: `Σ ExamQuestion.points` phải bằng `Exam.totalPoints`.

## Question types — MVP vs mở rộng

**MVP** (tạo + chấm + hiển thị): `multiple_choice`, `true_false`, `fill_blank`, `short_answer`, `essay`.

**Mở rộng** (chỉ bật khi backend + UI hỗ trợ đầy đủ): `multiple_select`, `matching`, `ordering`, `numeric`.

Auto-grade trong [attempt-and-result.md](./attempt-and-result.md) chỉ áp dụng cho loại đã bật ở môi trường tương ứng.

## Phân quyền giao đề

Không dùng permission granular riêng `assign_exam`. Quyền giao đề nằm trong role:

| Role | Giao đề |
| :--- | :--- |
| `admin` | Mọi exam |
| `teacher` | Exam do mình sở hữu (`ownerId`) hoặc trong phạm vi lớp mình quản lý |
| `student` | Không |

## EXP — nguồn dữ liệu

- **Nguồn truth:** bảng `exp_ledger` (một bản ghi idempotent / attempt đã `graded`).
- **Cache/projection:** `users.math_exp`, … — aggregate từ ledger; có thể rebuild.
- Legacy `PATCH /api/quizzes` + `users.*_exp` trực tiếp: chỉ giai đoạn migrate.

## Mã lỗi HTTP (gợi ý)

| Code | Khi nào |
| :--- | :--- |
| `401` | Chưa đăng nhập / session hết hạn |
| `403` | Role hoặc ownership không đủ |
| `404` | Resource không tồn tại hoặc không thuộc phạm vi user |
| `409` | Vượt `attemptLimit`, attempt đã submit, trùng idempotency |
| `422` | Validation nghiệp vụ (exam chưa publish, câu hỏi draft, …) |
| `429` | Rate limit (login, upload) |

## Idempotency

- `POST /api/exam-assignments/:id/attempts/:attemptId/submit` (hoặc submit attempt): header `Idempotency-Key` để tránh cộng EXP / chấm trùng.
- Ghi `exp_ledger` bắt buộc unique `(attempt_id)`.
