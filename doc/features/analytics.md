# Feature: Analytics

## 1. Mục tiêu

Cung cấp thống kê đọc được cho teacher/admin: độ khó thực tế của câu hỏi, kết quả theo đề/lớp, hỗ trợ cải thiện chất lượng câu hỏi. Analytics **tính từ Attempt đã graded**, không tin score frontend.

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

**Lưu trữ:** tính on-the-fly hoặc materialize `question_stats` (rebuild định kỳ). Không copy stats khi duplicate question.

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
| `GET` | `/api/exams/:id/analytics` | Thống kê đề | Owner exam / admin |
| `GET` | `/api/classes/:id/analytics?examId=` | Thống kê lớp × đề | Class owner / admin |
| `GET` | `/api/students/me/stats` | Tóm tắt cá nhân (optional) | `student` |

Query chung: `from`, `to` (ISO datetime) để giới hạn cửa sổ thời gian attempt.

## 5b. Phân tích sâu và xuất dữ liệu (cải tiến)

- **Phân tích đáp án nhiễu:** với `multiple_choice`/`multiple_select`, trả tỷ lệ chọn từng option (`optionStats: [{ optionId, selectedRate }]`) để teacher phát hiện đáp án gây nhầm lẫn hoặc câu có đáp án sai. Chỉ aggregate, không lộ câu trả lời từng học sinh.
- **Thời gian làm:** ghi `answered_at` mỗi lần lưu; `averageTimeSeconds` tính từ chênh lệch các lần lưu liên tiếp trong cùng attempt (câu đầu tính từ `started_at`). Bỏ qua dữ liệu vượt trần hợp lý để không bị lệch bởi học sinh bỏ treo.
- **So sánh lớp:** `GET /api/exams/:id/analytics?groupBy=class` trả điểm trung bình, tỷ lệ hoàn thành theo từng lớp được giao; chỉ cho owner exam/admin.
- **Xuất CSV:** `GET /api/exams/:id/results?format=csv` và `GET /api/classes/:id/analytics?format=csv&examId=`: các cột học sinh, lớp, số lượt, điểm tốt nhất, điểm lần cuối, trạng thái, thời điểm nộp. File UTF-8 có BOM để mở đúng tiếng Việt trong Excel; cùng quyền và phạm vi như bản JSON.
- **Học sinh cần chú ý:** danh sách học sinh chưa làm bài sau hạn, hoặc điểm dưới ngưỡng do teacher chọn.

Tiêu chí xong: CSV mở được trong Excel không lỗi dấu; `optionStats` cộng lại bằng 1 trên các option của câu; không thể xem dữ liệu ngoài phạm vi sở hữu.

## 6. Privacy

- Không trả nội dung answer của student khác trong analytics aggregate.
- Danh sách điểm từng học sinh: `GET /api/exams/:id/results` (theo đề) hoặc `GET /api/students/:id/results` (theo HS); thống kê lớp dùng `GET /api/classes/:id/analytics`. Không có `GET /api/classes/:id/results`.
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
| Class | [class-management.md](./class-management.md) |
| EXP | [exp.md](./exp.md) |
| Schema | `attempt_answers`, optional `question_stats` |
