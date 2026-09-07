# Feature: Question Management

## 1. Mục tiêu

Cho phép người quản lý tạo, chỉnh sửa, xem trước, kiểm tra và quản lý vòng đời của câu hỏi dùng trong bài học, ngân hàng câu hỏi và bộ đề.

## 2. Actor

- Admin
- Teacher

Quyền cụ thể phụ thuộc RBAC; không có role `content_creator` riêng — teacher/admin tạo và duyệt câu hỏi theo phạm vi được cấp.

## 3. Question Model

`subjectId` dùng các giá trị `TagKey` (`math`, `lang`, `flang`, `sci`, `hist_geo`, `civic`) — cùng bộ key môn học trong [overview.md](../overview.md#môn-học-tag).

```json
{
  "id": "question_001",
  "type": "multiple_choice",
  "subjectId": "math",
  "grade": 7,
  "topicIds": ["linear-equation"],
  "difficulty": "medium",
  "content": [],
  "options": [],
  "answer": {},
  "explanation": {},
  "points": 1,
  "tags": ["algebra"],
  "status": "draft",
  "createdBy": "user_001",
  "createdAt": "...",
  "updatedAt": "..."
}
```

## 4. Question Types

MVP:

- `multiple_choice`
- `true_false`
- `fill_blank`
- `short_answer`
- `essay`

Có thể mở rộng:

- `multiple_select`
- `matching`
- `ordering`
- `numeric`

## 5. Rich Content

`content` không nên chỉ là một string. Nên hỗ trợ các block:

```json
[
  {
    "type": "text",
    "value": "Tính giá trị biểu thức:"
  },
  {
    "type": "latex",
    "value": "\\frac{2}{3}+\\frac{1}{6}"
  },
  {
    "type": "image",
    "mediaId": "media_001"
  }
]
```

Chi tiết: [media-upload.md](./media-upload.md).

Điều này cho phép sử dụng chung cho Toán, Tiếng Anh và KHTN.

Phương án trắc nghiệm (`options[].content`) dùng cùng mô hình block (text / LaTeX / ảnh), không chỉ plain text.

## 6. Answer

Các dạng:

```json
{
  "type": "single",
  "value": "B"
}
```

```json
{
  "type": "multiple",
  "value": ["A", "C"]
}
```

```json
{
  "type": "text",
  "value": ["goes"]
}
```

```json
{
  "type": "numeric",
  "value": 3.14,
  "tolerance": 0.01
}
```

Tự luận:

```json
{
  "type": "manual"
}
```

## 7. Explanation

Nên lưu đáp án giải thích để phục vụ chế độ học tập:

```json
{
  "text": "Ta có 2x + 5 = 15.",
  "steps": [
    "2x = 10",
    "x = 5"
  ]
}
```

## 8. Validation

Khi lưu/publish:

- Phải có nội dung.
- Phải có `type`.
- Multiple choice phải có option.
- Phải có đáp án nếu loại câu hỏi cho phép chấm tự động.
- Không được có option ID trùng nhau.
- Không được có đáp án tham chiếu đến option không tồn tại.
- `points > 0`.
- LaTeX phải parse được ở mức validation cơ bản.
- Image/media phải tồn tại.

## 9. Lifecycle

```text
draft
  ↓  (teacher submit for review)
review
  ↓  (admin hoặc teacher owner approve)
published
  ↓  (archive)
archived
```

| Chuyển trạng thái | Actor | Ghi chú |
| :--- | :--- | :--- |
| `draft` → `review` | Teacher (owner) / Admin | Validate đầy đủ trước khi gửi duyệt |
| `review` → `published` | Admin hoặc teacher owner | Tăng `version`; câu published dùng cho đề chính thức |
| `review` → `draft` | Admin hoặc teacher owner | Trả về sửa, kèm comment (tùy chọn) |
| `published` → `archived` | Admin / owner | Không dùng cho đề mới; attempt cũ giữ snapshot |

MVP có thể cho teacher tự `draft → published` nếu chưa có quy trình duyệt — khi bật review, bắt buộc qua `review`.

Chỉ `published` mới được sử dụng cho đề chính thức.

## 10. API gợi ý

```text
POST   /api/questions
GET    /api/questions/:id
PATCH  /api/questions/:id
DELETE /api/questions/:id

POST   /api/questions/:id/submit-review
POST   /api/questions/:id/publish
POST   /api/questions/:id/archive

POST   /api/questions/:id/duplicate
```

## 11. Acceptance Criteria

- Người dùng có thể tạo câu hỏi thuộc môn/lớp/chủ đề.
- Có thể thêm text, LaTeX và hình ảnh.
- Có thể chọn loại câu hỏi.
- Có thể khai báo đáp án và lời giải.
- Có thể preview câu hỏi trước khi publish.
- Câu hỏi draft không xuất hiện trong đề published (có thể gắn vào đề **nháp** qua composer; publish đề sẽ publish hoặc từ chối các draft chưa hợp lệ).
- Câu hỏi published có thể tái sử dụng trong nhiều bộ đề.
- Tạo câu trong [Exam Composer](./exam-management.md#10-trình-soạn-đề-tích-hợp-exam-composer) vẫn tạo `Question` độc lập (không copy vào exam).
