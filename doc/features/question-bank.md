# Feature: Question Bank

## 1. Mục tiêu

Quản lý tập câu hỏi có thể tái sử dụng và hỗ trợ tìm kiếm/lọc câu hỏi để tạo đề thủ công hoặc tự động.

## 2. Entity

```json
{
  "id": "bank_001",
  "name": "Toán 7 - Đại số",
  "description": "...",
  "subjectId": "math",
  "grade": 7,
  "ownerId": "teacher_001",
  "createdAt": "...",
  "updatedAt": "..."
}
```

Quan hệ:

```text
subjects → topics
QuestionBank (subjectId, grade)
   └── question_bank_items → Question (topicIds → topics)
```

Một question có thể thuộc nhiều bank qua `question_bank_items`. Taxonomy: [\_cross-cutting.md](./_cross-cutting.md#taxonomy-subject--topic).

## 3. Search & Filter

Hỗ trợ:

- Subject
- Grade
- Topic
- Difficulty
- Question type
- Tags
- Status
- Creator
- Has image
- Has LaTeX
- Created date
- Updated date

Ví dụ:

```text
Math
Grade 7
Topic = Phân số
Difficulty = Medium
Type = Multiple Choice
Status = Published
```

Lọc topic dùng `GET /api/questions?topicId=<uuid>` — có trên trang `/questions` và tab **Ngân hàng** của Exam Composer. Quy tắc topic: [\_cross-cutting.md](./_cross-cutting.md#chủ-đề-topic).

## 4. Question Metadata

Nên có:

```json
{
  "difficulty": "easy | medium | hard",
  "estimatedTime": 60,
  "points": 1,
  "tags": [],
  "topicIds": [],
  "learningObjectiveIds": []
}
```

`estimatedTime` tính theo giây hoặc phút và có thể dùng để sinh đề theo tổng thời lượng.

## 5. Question Usage

Chi tiết metric và API: [analytics.md](./analytics.md).

Tóm tắt — theo dõi (tính từ Attempt `graded`, không copy khi duplicate):

```json
{
  "usageCount": 12,
  "correctRate": 0.68,
  "averageTime": 43
}
```

Endpoint: `GET /api/questions/:id/stats`.

## 6. Random Question Selection

Hỗ trợ yêu cầu:

```json
{
  "subjectId": "math",
  "grade": 7,
  "topicIds": ["10000000-0000-4000-8000-000000000001"],
  "count": 10,
  "difficulty": {
    "easy": 0.4,
    "medium": 0.4,
    "hard": 0.2
  },
  "types": ["multiple_choice", "short_answer"]
}
```

`topicIds` (UUID, tùy chọn): chỉ lấy câu gắn **ít nhất một** topic trong danh sách. Bỏ trống → không lọc theo topic.

Backend:

```text
filter
  ↓
exclude unavailable questions
  ↓
group by difficulty
  ↓
random/sample
  ↓
validate
  ↓
return questions
```

## 7. Duplicate

Khi duplicate:

- Tạo Question ID mới.
- Giữ nguyên nội dung.
- Có thể giữ metadata.
- Không copy usage statistics.
- Ghi `duplicatedFrom` nếu cần audit.

## 8. Acceptance Criteria

- Có thể tạo question bank.
- Có thể thêm/bỏ câu hỏi.
- Có thể tìm kiếm và lọc.
- Có thể chọn nhiều câu để tạo đề.
- Có thể random theo topic/difficulty/type.
- Chỉ question published mới được chọn cho đề published.
