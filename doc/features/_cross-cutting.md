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

## Ngân sách đọc của học sinh

Dashboard, làm bài, nộp bài và ôn từ tuân [student-response.md](./student-response.md). Tóm tắt bắt buộc khi sửa mã:

- Một `GET /api/auth/me` mỗi lần tải trang; middleware resolve session + user bằng một query.
- `GET /api/students/me/assignments` mang `remainingAttempts`, `inProgressAttemptId`, `latestFinishedAttempt`. UI không gọi attempt theo từng đề.
- `GET /api/attempts/:id` (chủ attempt là student) trả snapshot, câu đã lưu, `serverNow` và `expiresAt` trong tối đa hai lượt database.
- Stats, EXP và lớp không được đứng trước lần vẽ danh sách bài hoặc thẻ từ đầu tiên.

## Taxonomy (Subject / Topic)

```text
subjects (TagKey: math, lang, …)
   └── topics (id, subject_id, name, grade? — null = mọi lớp)
        └── question_topic_links → questions
```

- **`subjectId`** trên `Question`, `Exam` = key trong bảng `subjects` (= `TagKey`).
- **`topicIds`** trên `Question` = mảng UUID tới `topics.id` (bảng nối `question_topic_links`); không trùng với `tags` (nhãn tự do, ví dụ `"algebra"`).

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

- Lọc câu hỏi: `GET /api/questions?topicId=` (danh sách câu hỏi, tab “Câu có sẵn” trong composer).
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
| **Hạn nộp** | `ExamAssignment.deadline` | Không cho **bắt đầu** attempt mới sau deadline. Attempt đang `in_progress` cũng hết hạn khi `deadline` đến (`expireIfNeeded`); `expires_at` khi start = `min(now + duration, deadline)` nếu `duration > 0`, hoặc bằng deadline nếu `duration = 0` |
| **Thời gian mở** | `ExamAssignment.availableFrom` | Không hiển thị / không cho start trước thời điểm này |

Client vẽ đồng hồ từ `serverNow` và `expiresAt` của chính response attempt, rồi tick locally. Không gọi thêm API để lấy giờ. Công thức và ngân sách request: [student-response.md](./student-response.md).

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

**Đã bật UI/chấm:** `multiple_select`, `numeric`, `matching`, `ordering`.

Bài học (`Exam.type = lesson`), thẻ chọn, kiểm tra tức thì và game nối từ: [interactive-lessons.md](./interactive-lessons.md).

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
- Legacy `PATCH /api/quizzes` + ghi trực tiếp `users.*_exp` đã bị loại khỏi code.

## Class, grading, media, analytics

- Lớp: [class-management.md](./class-management.md)
- Chấm thủ công: [manual-grading.md](./manual-grading.md)
- Upload: [media-upload.md](./media-upload.md)
- Analytics: [analytics.md](./analytics.md)
- Migrate legacy: [migration-legacy.md](../migration-legacy.md)

## Yêu cầu phi chức năng

### Khởi động và trạng thái chờ

Backend chạy Render Free có thể ngủ; cronjob buổi tối giữ thức (việc vận hành). Frontend luôn hiện skeleton, và sau 3 giây hiện "Hệ thống đang khởi động" thay vì màn trắng. Chi tiết: [student-response.md](./student-response.md#8-cold-start-giữ-thức-và-màn-đang-khởi-động).

### Kiểm thử

- Unit test giữ như hiện có (`npm test`).
- Bổ sung **test tích hợp** (backend + database thử) cho các luồng dễ lỗi do đồng thời và idempotency: bấm **Bắt đầu** hai lần song song (một attempt, một snapshot); nộp hai lần; ghi `exp_ledger` trùng; regrade không cộng trùng; hết hạn khi đang làm; giao lớp bỏ qua trùng.
- Bổ sung một **e2e smoke test** cho đường chính: đăng nhập → bắt đầu → trả lời → nộp → xem kết quả; và một cho ôn từ (thẻ đầu → thuộc).
- Chạy trong CI trước khi deploy.

### Quan sát và vận hành

- Log có cấu trúc (JSON) kèm `requestId`, `userId`, route, thời gian xử lý; không ghi mật khẩu, token, đáp án.
- Theo dõi lỗi (ví dụ Sentry) cho cả frontend và backend; cảnh báo khi tỷ lệ lỗi 5xx tăng.
- Đo độ trễ theo route cho các endpoint trong ngân sách học sinh ([student-response.md](./student-response.md)); cảnh báo khi vượt ngưỡng.
- Cảnh báo khi gửi email mời/reset thất bại; admin thấy trạng thái gửi và có nút gửi lại.
- `GET /api/health` kiểm tra được cả kết nối database (bản nhẹ cho cronjob, bản đầy đủ cho giám sát).

### Truy cập và di động

- Giao diện responsive tối thiểu từ 360px; học sinh làm bài chủ yếu trên điện thoại. Vùng bấm tối thiểu 44px; bảng câu hỏi dạng ngăn kéo trên màn nhỏ.
- Dùng được bằng bàn phím (thứ tự tab, focus nhìn thấy được); độ tương phản chữ đạt mức WCAG AA; không chỉ dựa vào màu để phân biệt đúng/sai (kèm biểu tượng và chữ).
- Ảnh trong câu hỏi có `alt`; công thức LaTeX hiển thị tốt trên màn nhỏ (cuộn ngang trong khối, không làm vỡ trang).
- Nút/điều khiển thay cho kéo-thả (Lên/Xuống, nối bằng hai lần bấm) giữ nguyên để dùng được trên cảm ứng.

### Bảo mật và riêng tư

- Người dùng là trẻ vị thành niên: tối thiểu hóa dữ liệu hiển thị công khai (không email trên bảng xếp hạng; xem [leaderboard.md](./leaderboard.md#11-riêng-tư-và-công-bằng-cải-tiến)).
- Rate limit không chỉ cho login/upload mà cả các endpoint nặng (analytics, export CSV, import tài khoản) và `check` của bài học.
- Chống gian lận mức nhẹ (tùy đề): xáo câu/đáp án đã có; tùy chọn ghi nhận số lần rời tab trong attempt để teacher tham khảo (chỉ ghi nhận, không tự trừ điểm).
- Phiên: không cache user phía server (giữ nguyên quy tắc); nếu tải tăng, chỉ được cân nhắc cache ngắn kèm vô hiệu hóa ngay khi logout/khóa tài khoản, và phải cập nhật [student-response.md](./student-response.md#7-việc-không-được-đưa-vào-luồng-học-sinh) trước.

### Sao lưu và dữ liệu

- Sao lưu Supabase định kỳ và thử khôi phục theo lịch; ghi rõ chu kỳ và thời gian giữ.
- Lưu trữ theo năm học: lớp, assignment, attempt cũ được đánh dấu lưu trữ, không xóa; truy vấn mặc định chỉ lấy năm học hiện tại.
- Dọn media mồ côi theo lịch (media không còn block nào tham chiếu quá N ngày); cảnh báo trước khi xóa.

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

- Submit attempt: `POST /api/attempts/:id/submit`. Không dùng header `Idempotency-Key`; client gọi lại submit khi attempt đã khóa nhận lỗi nghiệp vụ (`409` / trạng thái không còn `in_progress`).
- Ghi `exp_ledger` bắt buộc unique `(attempt_id)` — chống cộng EXP trùng khi grade/regrade.
