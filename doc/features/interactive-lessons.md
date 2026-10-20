# Feature: Bài học tương tác

## 1. Mục tiêu

Cho phép giáo viên tạo bài học theo nhịp **lý thuyết rồi luyện tập**, và cho học sinh làm các dạng bài gần với game:

- Chọn thẻ (một hoặc nhiều đáp án đúng) thay cho danh sách radio/checkbox.
- Nối hai vế (từ với nghĩa, phép tính với kết quả, …).
- Sắp xếp các mục theo thứ tự đúng.
- Đọc lý thuyết từng phần, làm câu của phần đó, bấm **Kiểm tra** để biết đúng/sai ngay.
- Nối từ vựng với nghĩa trên trang ôn từ, không đụng lịch SRS và không cộng EXP.

Đề kiểm tra (`quiz`, `midterm`, `final`, …) giữ nguyên: không kiểm tra từng câu khi đang làm, đáp án chỉ hiện theo rule reveal hiện có.

## 2. Cách gắn vào hệ thống

Không thêm bảng mới.

| Việc | Dùng lại |
| :--- | :--- |
| Câu nối / sắp xếp | `questions.type` đã có `matching`, `ordering`; đáp án nằm trong `questions.answer` jsonb |
| Câu trả lời học sinh | `attempt_answers.value` jsonb |
| Bài học | `exams.type = lesson` |
| Lý thuyết | `exam_sections.content` jsonb (cùng block text / LaTeX / ảnh như câu hỏi) |
| Giao bài, snapshot, điểm, EXP | Luồng attempt hiện tại |

Migration: `supabase/migrations/20261020000000_interactive_lessons.sql`.

- Thêm `lesson` vào check của `exams.type`.
- Thêm `exam_sections.content jsonb NOT NULL DEFAULT '[]'`.

## 3. Chọn thẻ

`multiple_choice`, `true_false` và `multiple_select` giữ nguyên dữ liệu và cách chấm. Trang làm bài vẽ mỗi phương án thành một thẻ bấm được.

- Một đáp án: bấm thẻ khác thì thẻ cũ bỏ chọn.
- Nhiều đáp án: bấm để bật/tắt. Đúng khi tập id khớp chính xác (không điểm từng phần).

## 4. Nối cặp (`matching`)

### Option

- Vế trái: id `L1`, `L2`, … (`^L[1-9]\d*$`)
- Vế phải: id `R1`, `R2`, …
- Ít nhất 2 vế mỗi cột. Vế phải không nằm trong đáp án là đáp án nhiễu.
- Nội dung mỗi vế là content block (text / LaTeX / ảnh), giống phương án trắc nghiệm.

### Đáp án

```json
{ "type": "pairs", "value": { "L1": "R2", "L2": "R1" } }
```

Mỗi vế trái có đúng một vế phải, và không hai vế trái cùng trỏ một vế phải.

### Câu trả lời học sinh

Cùng hình `{ "L1": "R2" }`. Học sinh chọn vế trái rồi chọn vế phải. Chọn lại một vế phải đang nối sẽ gỡ nối cũ.

### Xáo trộn

Khi tạo snapshot, cột trái giữ thứ tự soạn. Cột phải **luôn** xáo, kể cả khi `shuffleOptions` tắt, vì thứ tự soạn thường trùng với đáp án. Đáp án map theo id nên xáo thứ tự không đổi key.

## 5. Sắp xếp (`ordering`)

Các mục là `question_options` (id `A`, `B`, …). Đáp án là hoán vị đủ của các id, theo thứ tự đúng:

```json
{ "type": "sequence", "value": ["C", "A", "B"] }
```

Học sinh đổi chỗ bằng nút Lên/Xuống. Snapshot **luôn** xáo các mục, vì thứ tự soạn chính là đáp án.

## 6. Chấm

Backend chấm trong `autoGradeAnswer`. `isCorrect` chỉ là `true` khi đủ điểm.

| Loại | Điểm |
| :--- | :--- |
| `pairs` | `points * (số cặp đúng / số vế trái)` |
| `sequence` | `points * (số vị trí đúng / số mục)` |

Làm tròn 2 chữ số thập phân. Cột phải nhiễu không tăng mẫu số. Câu trả lời trống = 0 điểm, không chuyển chấm tay.

Ví dụ câu nối 2 điểm, đúng 1/2 cặp → 1 điểm, `isCorrect = false`. Trang kết quả ghi **đúng một phần** khi `pointsEarned > 0` và chưa đủ.

## 7. Bài học (`lesson`)

`Exam.type = lesson` là một đề bình thường:

- Composer hiện khối **Lý thuyết từng phần**. Mỗi section có `title` và `content` (block). Nút **Lưu lý thuyết** gọi `PATCH /api/exams/:id/sections/:sectionId`.
- Câu trên đề vẫn gắn `sectionId` như cũ. Câu không thuộc section nào hiện sau các phần.
- Học sinh làm từng bước: lý thuyết của section (nếu có `content` hoặc `description`), rồi từng câu của section đó.
- Nộp bài, snapshot, attempt limit, deadline và EXP vẫn đi qua luồng attempt.

`description` của section vẫn là text ngắn. Nếu `content` rỗng mà `description` có chữ, player hiện description như một block text.

EXP của `lesson` bằng `practice`: `floor(score)`, trần `floor(maxScore)`.

## 8. Kiểm tra tức thì

```text
POST /api/attempts/:id/check
```

Body giống `PATCH /api/attempts/:id/answers`: `{ questionId, value }`.

Chỉ học sinh sở hữu attempt `in_progress`, và chỉ khi snapshot có `exam.type = lesson`. Đề khác trả `422 CHECK_NOT_ALLOWED`.

Endpoint lưu câu trả lời rồi trả về:

```json
{
  "isCorrect": false,
  "pointsEarned": 1,
  "points": 2,
  "requiresManual": false,
  "pairs": [
    { "leftId": "L1", "correct": true },
    { "leftId": "L2", "correct": false }
  ]
}
```

`pairs` / `positions` chỉ nói từng vế hoặc từng vị trí đúng hay sai. Không trả id đáp án đúng. Học sinh được kiểm tra lại sau khi sửa. Điểm chính thức vẫn tính lúc nộp, từ câu trả lời đã lưu.

`positions[].optionId` là lựa chọn của học sinh, không phải key.

## 9. Game nối từ vựng

Trang `/vocabulary/review` có chế độ **Nối từ** cạnh flashcard.

- Lấy tối đa 5 thẻ due, xáo từ và nghĩa, chấm trên trình duyệt.
- Nối đúng không gọi API review, không đổi `next_review_at`, không cộng EXP.
- Flashcard vẫn là cách ghi nhận thuộc / chưa thuộc.

## 10. Ngoài phạm vi

- Kéo-thả.
- Nhập câu nối / sắp xếp bằng dán text hàng loạt.
- Sinh câu `matching` từ vocabulary bank vào đề.
- Điểm từng phần cho trắc nghiệm nhiều đáp án.
- Hiện đáp án đúng ngay sau **Kiểm tra** (chỉ đúng/sai và điểm từng phần).
