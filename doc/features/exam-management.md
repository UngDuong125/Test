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
| `Exam.duration` | Thời lượng làm bài (phút). `0` = **không giới hạn** thời lượng đề; timer đếm từ `Attempt.startedAt` khi `duration > 0`. |
| `ExamAssignment.deadline` | Hạn **bắt đầu** attempt mới (xem [Exam Distribution](./exam-distribution.md)). Với đề không giới hạn, `Attempt.expires_at` thường gắn với deadline assignment. |

Hành vi khi `duration > 0` và hết giờ:

- Backend set `Attempt.expires_at = min(startedAt + duration, assignment.deadline)`.
- Hết giờ: auto-submit nếu có answer, hoặc chuyển `expired`.
- Attempt đã bắt đầu trước `deadline` vẫn được nộp trong thời lượng còn lại (không bị deadline cắt giữa chừng trừ khi policy bổ sung).

Hành vi khi `duration = 0`:

- Không có timer thời lượng đề; học sinh làm đến khi nộp hoặc đến hạn assignment.
- `Attempt.expires_at` lấy theo `assignment.deadline`.

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

## 10. Trình soạn đề tích hợp (Exam Composer)

Màn hình tạo/sửa đề (`/exams/new`, `/exams/[id]/edit`) cho phép nhập metadata, thêm câu từ ngân hàng **hoặc tạo câu mới**, xem trước và publish — **không** nhúng/copy nội dung câu vào đề. Câu mới vẫn là `Question` (thường `status=draft`); đề chỉ lưu liên kết qua `exam_questions`, tương thích snapshot khi học sinh làm bài và tái sử dụng ở đề khác.

### Luồng

```text
Tạo đề nháp
  → nhập thông tin đề (autosave)
  → thêm câu từ ngân hàng hoặc “Tạo câu hỏi mới”
  → câu mới: Question draft + exam_questions (transaction)
  → xem trước / chỉnh điểm / sắp xếp section
  → validate → xuất bản (publish câu draft hợp lệ nếu xác nhận + publish đề)
```

### UI (MVP — 3 vùng)

| Vùng | Nội dung |
| :--- | :--- |
| Cột trái | Thông tin đề: tên, môn, lớp, thời lượng, loại, tổng điểm, hướng dẫn |
| Giữa | Section + danh sách câu trên đề: chỉnh điểm, bỏ khỏi đề, (phase 2: kéo-thả); panel **Tạo câu mới** (form) hoặc **Dán text** (tạo hàng loạt) |
| Phải / modal | “Thêm từ ngân hàng”, “Tạo câu hỏi mới”, “Dán text” |

### Tạo nhanh từ text (bulk)

Trong composer, tab **Dán text** cho phép paste nhiều câu theo định dạng field, xem trước, rồi tạo hàng loạt (gọi `POST .../questions/create` từng câu). MVP hỗ trợ:

- `multiple_choice` (trắc nghiệm)
- `true_false` (đúng/sai)
- `fill_blank` (điền khuyết)
- `short_answer` (trả lời ngắn)

Mỗi câu cách nhau bằng dòng `===`. Trường chính: `TYPE`, `Q`, phương án `A)`…`D)` (đánh dấu `*` đáp án đúng), `ANSWER`, `POINTS`, `DIFFICULTY`, `EXPLAIN`.

Ví dụ:

```text
===
TYPE: multiple_choice
Q: 2 + 2 = ?
A) 3
B) 4*
C) 5
POINTS: 1
===
TYPE: true_false
Q: Trái Đất quay quanh Mặt Trời.
ANSWER: đúng
===
TYPE: fill_blank
Q: Thủ đô Việt Nam là ____.
ANSWER: Hà Nội | Ha Noi
===
TYPE: short_answer
Q: Công thức diện tích hình vuông cạnh a?
ANSWER: a^2 | a²
===
```

Parse chạy trên frontend; câu không hợp lệ phải sửa trước khi tạo. Ảnh/media và loại câu khác vẫn dùng form UI.

**Text / LaTeX:** Trong `Q` và phương án `A)`… có thể xen text với LaTeX:

- Inline: `$...$` hoặc `\(...\)`
- Display: `$$...$$` hoặc `\[...\]`
- Cả field: `latex: \frac{1}{2}`
- `ANSWER` điền/ngắn: text thường hoặc bọc `$...$` / `latex: ...` (lưu chuỗi LaTeX đã chuẩn hóa để chấm)

Ví dụ:

```text
===
TYPE: multiple_choice
Q: Giá trị của $\frac{1}{2} + \frac{1}{3}$ là?
A) $\frac{1}{5}$
B) $\frac{5}{6}$*
C) 1
POINTS: 1
===
TYPE: short_answer
Q: Công thức nghiệm PT bậc hai?
ANSWER: latex: \frac{-b\pm\sqrt{b^2-4ac}}{2a}
===
```

### Quy tắc lưu

- **Tạo đề** → `Exam.status = draft`.
- **Tạo câu trong composer** → `Question.status = draft`, rồi tạo `exam_questions` ngay (cùng transaction / rollback nếu gắn đề thất bại).
- **Autosave** metadata đề (PATCH); UI hiển thị `Đã lưu` / `Đang lưu` / `Có lỗi`.
- **Bỏ câu khỏi đề** → chỉ xóa liên kết `exam_questions`; không tự xóa `Question`. Có thể “xóa bản nháp chưa dùng” riêng (phase 2 hoặc action tùy chọn).
- **Lưu vào ngân hàng** (`bankId` khi tạo): tùy chọn; mặc định theo bank đã chọn trong UI — tránh đầy kho bằng draft không mong muốn.
- **Publish**: mọi câu gắn đề phải hợp lệ và `published`; `Σ ExamQuestion.points = Exam.totalPoints`. Có thể yêu cầu xác nhận `publishDraftQuestions` để publish các câu draft (do composer tạo) trước khi publish đề.

### Roadmap

| Đợt | Phạm vi |
| :--- | :--- |
| **MVP** | Đề nháp, tạo câu mới trong editor, **dán text hàng loạt** (TN/Đ-S/điền/ngắn), thêm từ bank, autosave, preview, validate trước publish |
| **Hoàn thiện** | Kéo-thả, section template, phím tắt, duplicate question, cảnh báo chưa vào bank, version/draft recovery, bulk API 1 request, hỗ trợ thêm loại câu |

## 11. API gợi ý

```text
POST   /api/exams
GET    /api/exams/:id
PATCH  /api/exams/:id
DELETE /api/exams/:id

POST   /api/exams/:id/questions
POST   /api/exams/:id/questions/create
PATCH  /api/exams/:id/questions/:questionId
DELETE /api/exams/:id/questions/:questionId

POST   /api/exams/:id/validate
POST   /api/exams/:id/publish
POST   /api/exams/:id/archive
POST   /api/exams/:id/duplicate

POST   /api/exams/generate
```

### Composer endpoints

| Method | Path | Mô tả |
| :--- | :--- | :--- |
| `POST` | `/api/exams/:id/questions` | Gắn câu có sẵn (từ bank / published / draft của mình) |
| `POST` | `/api/exams/:id/questions/create` | Tạo `Question` draft (+ optional `bankId`) **và** gắn `exam_questions` trong một bước; rollback nếu gắn thất bại |
| `PATCH` | `/api/exams/:id/questions/:questionId` | Đổi `sectionId`, `order`, `points` override |
| `POST` | `/api/exams/:id/validate` | Trả toàn bộ lỗi/cảnh báo trước publish (không mutate) |
| `POST` | `/api/exams/:id/publish` | Body tùy chọn `{ "publishDraftQuestions": true }` — publish các câu draft hợp lệ trên đề rồi publish đề |

`GET /api/exams/:id` trả thêm `questionDetails` (payload `Question` đầy đủ của các câu đang gắn) để composer không phải N+1.

API tạo/cập nhật question độc lập (`/api/questions`) vẫn giữ nguyên cho quản lý ngân hàng.

### `POST /api/exams/generate`

Sinh đề nháp (`status=draft`) từ Question Bank / filter — dùng cùng pipeline random với [question-bank.md](./question-bank.md).

**Request:**

```json
{
  "title": "Ôn tập phân số - tuần 3",
  "subjectId": "math",
  "grade": 7,
  "type": "practice",
  "duration": 30,
  "bankId": "bank_001",
  "selection": {
    "count": 10,
    "topicIds": ["fractions"],
    "difficulty": { "easy": 0.4, "medium": 0.4, "hard": 0.2 },
    "types": ["multiple_choice", "fill_blank", "short_answer"]
  },
  "sectionTitle": "Phần trắc nghiệm",
  "defaultPoints": 1
}
```

| Field | Bắt buộc | Mô tả |
| :--- | :--- | :--- |
| `title`, `subjectId`, `grade`, `type` | Có | Metadata exam |
| `duration` | Có | Phút; `0` = không giới hạn thời lượng đề |
| `bankId` | Không | Giới hạn trong một bank; thiếu → filter theo subject/grade |
| `selection` | Có | Rule lấy mẫu (chỉ câu `published`) |
| `defaultPoints` | Không | Gán `ExamQuestion.points` nếu không lấy từ `Question.points` |

**Response (201):**

```json
{
  "exam": {
    "id": "exam_001",
    "status": "draft",
    "totalPoints": 10,
    "questionCount": 10
  },
  "warnings": []
}
```

**Lỗi thường gặp:**

| Code | Khi nào |
| :--- | :--- |
| `422` | Không đủ câu published thỏa filter / tỷ lệ difficulty |
| `403` | Không quyền bank hoặc subject |

Teacher chỉnh section/điểm rồi `POST /api/exams/:id/publish` như đề thủ công. Generate **không** publish sẵn.

## 12. Acceptance Criteria

- Tạo đề thủ công từ Question Bank.
- Tạo đề trong composer: thêm câu mới (Question draft + link) mà không copy nội dung vào đề.
- Sinh đề nháp qua `/api/exams/generate` theo filter/difficulty.
- Sắp xếp câu hỏi theo section/order.
- Thay đổi điểm từng câu.
- Autosave metadata đề; reload không mất nội dung đã lưu.
- Preview đề.
- Validate tổng điểm và trạng thái câu trước publish (`POST …/validate`).
- Publish đề (và tùy chọn publish câu draft hợp lệ trên đề).
- Không cho published exam chứa câu hỏi không hợp lệ / chưa published.
- Bỏ câu khỏi đề không xóa Question.
- Có thể duplicate đề.
