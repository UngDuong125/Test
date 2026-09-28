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
   └── topics (id, subject_id, name, grade? — null = mọi lớp)
        └── question_bank_items → questions
```

- **`subjectId`** trên `Question`, `QuestionBank`, `Exam` = key trong bảng `subjects` (= `TagKey`).
- **`topicIds`** trên `Question` = mảng UUID tới `topics.id` (bảng nối `question_topic_links`); không trùng với `tags` (nhãn tự do, ví dụ `"algebra"`).
- `QuestionBank` lọc theo `subjectId` + `grade`; câu hỏi có thể thuộc nhiều bank qua `question_bank_items`.

### Chủ đề (Topic)

Topic là danh mục **dùng chung** (không có owner) theo môn, tùy chọn theo lớp:

- `topic.grade = null` → áp dụng cho **mọi lớp** của môn đó.
- Tên topic duy nhất trong cùng (`subjectId`, `grade`), so sánh **không phân biệt hoa thường** và bỏ khoảng trắng thừa (backend kiểm tra; constraint DB không bắt được trường hợp `grade = null`).

**Topic hợp lệ cho một câu hỏi** khi:

- `topic.subjectId = question.subjectId`, và
- `topic.grade = null` hoặc `topic.grade = question.grade`.

Vi phạm → `422` với code `TOPIC_NOT_FOUND`, `TOPIC_SUBJECT_MISMATCH` hoặc `TOPIC_GRADE_MISMATCH`. Áp dụng cho `POST/PATCH /api/questions` và `POST /api/exams/:id/questions/create`.

**API:**

| Method | Path | Role | Mô tả |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/topics?subjectId=&grade=` | admin, teacher | Có `grade` → trả topic của lớp đó **và** topic `grade = null`. Sắp theo `name`. |
| `POST` | `/api/topics` | admin, teacher | Body `{ subjectId, name, grade? }`. **Idempotent**: đã có topic trùng tên (cùng môn + lớp) → `200` trả topic sẵn có; tạo mới → `201`. Response `{ topic }`. |
| `PATCH` | `/api/topics/:id` | admin | Body `{ name?, grade? }` (không đổi môn). Trùng tên → `409 TOPIC_DUPLICATE`; đổi `grade` sang lớp cụ thể mà còn câu hỏi lớp khác đang gắn → `409 TOPIC_GRADE_CONFLICT`. |
| `DELETE` | `/api/topics/:id` | admin | Topic đang gắn câu hỏi → `409 TOPIC_IN_USE`; thành công → `204`. |

**Dùng topic ở đâu:**

- Lọc câu hỏi: `GET /api/questions?topicId=` (danh sách câu hỏi, tab ngân hàng trong composer).
- Random/generate đề: `selection.topicIds` — lấy câu thuộc **ít nhất một** topic trong danh sách.
- Tạo câu (form và dán text): chọn topic có sẵn hoặc tạo mới ngay trong form qua `POST /api/topics`.
- Quản lý tập trung: trang `/topics` (teacher tạo; admin đổi tên/lớp, xóa).

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
| **Thời lượng làm bài** | `Exam.duration` (phút) | `duration > 0`: timer đếm ngược từ `Attempt.startedAt`; hết giờ → auto-submit hoặc `expired`. `duration = 0`: không giới hạn thời lượng đề |
| **Hạn nộp** | `ExamAssignment.deadline` | Không cho **bắt đầu** attempt mới sau deadline; attempt đang `in_progress` vẫn được nộp trong grace period ngắn nếu đã start trước deadline. Với đề `duration = 0`, `expires_at` thường bằng deadline |
| **Thời gian mở** | `ExamAssignment.availableFrom` | Không hiển thị / không cho start trước thời điểm này |

## Điểm câu hỏi

- `Question.points`: điểm mặc định khi thêm câu vào exam.
- `ExamQuestion.points`: **override** trên từng đề; giá trị này dùng khi chấm attempt.
- Khi publish exam: `Σ ExamQuestion.points` phải bằng `Exam.totalPoints`.

## Exam Composer

- Đề chỉ lưu **liên kết** (`exam_questions`), không nhúng nội dung câu.
- Tạo câu trong composer → `Question` draft + link; tái sử dụng được ở đề khác; snapshot attempt vẫn dựa trên Question/version.
- Chi tiết luồng, UI, API: [exam-management.md](./exam-management.md#10-trình-soạn-đề-tích-hợp-exam-composer).

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
- **Policy theo `Exam.type`:** xem [exp.md](./exp.md) (`practice`/`quiz`/`homework`/…).
- Legacy `PATCH /api/quizzes` + `users.*_exp` trực tiếp: chỉ giai đoạn migrate.

## Class, grading, media, analytics

- Lớp: [class-management.md](./class-management.md)
- Chấm thủ công: [manual-grading.md](./manual-grading.md)
- Upload: [media-upload.md](./media-upload.md)
- Analytics: [analytics.md](./analytics.md)
- Migrate legacy: [migration-legacy.md](../migration-legacy.md)

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
