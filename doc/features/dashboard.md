# Dashboard & làm bài

## 1. Mục đích

Dashboard là không gian làm bài của student. Người dùng xem các `ExamAssignment` thuộc quyền của mình, bắt đầu một `Attempt`, trả lời câu hỏi, nộp bài và xem kết quả theo quyền được cấu hình trên assignment.

Dashboard không tự tạo đề, không tự chọn lại câu hỏi và không tự quyết định điểm. Nội dung đề được quản lý bởi `Exam`; quyền truy cập và giới hạn làm bài được quản lý bởi `ExamAssignment`; lịch sử và kết quả được lưu trong `Attempt`.

## 2. Luồng student

1. Đăng nhập → vào `/dashboard` (không có session → redirect `/login`).
2. Tải các assignment mà user hiện tại được phép truy cập.
3. Hiển thị các assignment ở trạng thái `available`, `in_progress`, `completed` hoặc `expired`.
4. Student chọn assignment để xem:
   - tiêu đề, môn, mô tả và hướng dẫn của exam;
   - thời gian mở và deadline;
   - số lần đã làm và `attemptLimit`;
   - điểm/kết quả nếu assignment cho phép xem.
5. Chọn **Bắt đầu làm bài** → backend tạo `Attempt` và trả về snapshot exam/question cần hiển thị.
6. Student trả lời câu hỏi và lưu từng `Answer` trong khi làm.
7. Chọn **Nộp bài** → backend khóa attempt, kiểm tra câu trả lời và tính điểm.
8. Hiển thị kết quả theo `showResult`. Chỉ hiển thị đáp án/lời giải khi `showExplanation` được bật.

## 3. Điều kiện hiển thị assignment

Student chỉ được xem assignment khi:

- assignment thuộc user (`targetType=user`, `targetId=studentId`); assignment tạo từ lớp vẫn là bản ghi per-student sau expand;
- exam đang ở trạng thái `published`;
- assignment chưa bị `cancelled`;
- thời điểm hiện tại không trước `availableFrom`;
- chưa quá `deadline` (nếu có);
- vẫn còn lượt làm, hoặc đang tiếp tục một attempt `in_progress`.

Không dùng `Exam.assignedUsers[]` hoặc `User.assignedExams[]` để kiểm tra quyền. Việc truy cập phải đi qua `ExamAssignment`.

## 4. Attempt và trả lời

Mỗi lần chọn **Bắt đầu làm bài** hợp lệ tạo một `Attempt` mới.

```json
{
  "id": "attempt_001",
  "assignmentId": "assignment_001",
  "userId": "student_001",
  "examId": "exam_001",
  "status": "in_progress",
  "startedAt": "...",
  "submittedAt": null,
  "score": null,
  "maxScore": 10,
  "percentage": null
}
```

- Chỉ attempt `in_progress` mới nhận thêm answer.
- Không vượt quá `attemptLimit` của assignment.
- Một attempt chỉ được submit một lần.
- Attempt phải giữ exam/question version hoặc snapshot để kết quả cũ không đổi khi exam gốc được sửa.
- Khi hết thời gian, backend chuyển attempt sang `expired` và không nhận thêm answer.

## 5. Loại câu hỏi và hiển thị

Dashboard hỗ trợ các loại câu hỏi MVP trong [Question Management](./question-management.md):

- `multiple_choice`: chọn một option.
- `true_false`: chọn đúng/sai.
- `fill_blank`, `short_answer`: nhập câu trả lời.
- `essay`: nhập nội dung để teacher chấm thủ công.

Các loại mở rộng (`multiple_select`, `matching`, `ordering`, `numeric`) được render khi có trong snapshot attempt và backend hỗ trợ chấm tương ứng.

Question có thể chứa text, LaTeX và image block. Dashboard chỉ hiển thị question đã có trong snapshot của attempt; không nhận answer key trước khi submit nếu exam yêu cầu kiểm tra nghiêm túc.

## 6. Chấm điểm và kết quả

Backend là nơi duy nhất xác thực answer và tính điểm:

```text
score = Σ pointsEarned
percentage = score / maxScore * 100
```

- Các loại tự động chấm được xử lý theo `Question.answer` và rule của question type.
- Essay và câu cần đánh giá nội dung chuyển sang `needs_grading` để teacher chấm.
- Frontend không gửi `score` đã tự tính để backend tin tưởng.
- Kết quả gồm tối thiểu `score`, `maxScore`, `percentage`, trạng thái grading và feedback nếu có.
- Chỉ hiển thị đáp án đúng, explanation hoặc feedback theo setting của assignment và trạng thái attempt.

## 7. API

| Method | Endpoint | Mục đích |
| :--- | :--- | :--- |
| `GET` | `/api/students/:id/assignments` | Lấy assignment của student hiện tại |
| `GET` | `/api/exam-assignments/:id` | Xem chi tiết assignment và exam |
| `POST` | `/api/exam-assignments/:id/attempts` | Tạo attempt mới và trả về snapshot |
| `GET` | `/api/attempts/:id` | Lấy attempt đang làm hoặc đã nộp |
| `PATCH` | `/api/attempts/:id/answers` | Lưu/cập nhật answer của attempt |
| `POST` | `/api/attempts/:id/submit` | Submit và chấm bài ở backend |
| `GET` | `/api/attempts/:id/result` | Lấy kết quả theo quyền xem |

Request lưu answer chỉ chứa giá trị student chọn/nhập, ví dụ:

```json
{
  "questionId": "question_001",
  "value": "B"
}
```

## 8. UI

- Danh sách assignment có trạng thái rõ ràng: `available`, `in_progress`, `completed`, `expired`.
- Khu vực làm bài hiển thị progress, timer thời lượng đề (`Exam.duration`) và/hoặc deadline assignment, sections và trạng thái đã trả lời.
- Có thể điều hướng giữa các câu nhưng không làm thay đổi thứ tự hoặc snapshot của attempt.
- Nút **Lưu** có thể tự động lưu answer; nút **Nộp bài** cần xác nhận trước khi submit.
- Sau submit, hiển thị kết quả hoặc trạng thái `needs_grading` theo setting.
- Không hiển thị `high_score` toàn cục như kết quả cá nhân và không dùng nút “Làm lại đề mới” ngoài việc tạo attempt mới hợp lệ.

## 9. File liên quan

| Layer | Path |
| :--- | :--- |
| UI | `frontend/app/dashboard/page.tsx` |
| Exam | `doc/features/exam-management.md` |
| Assignment | `doc/features/exam-distribution.md` |
| Class | `doc/features/class-management.md` |
| Attempt/result | `doc/features/attempt-and-result.md` |
| Manual grading | `doc/features/manual-grading.md` |
| Question | `doc/features/question-management.md` |

## 10. Tương thích với implementation hiện tại

Implementation hiện tại vẫn dùng `/api/quizzes` và bảng `quizzes` với câu hỏi nhúng. Đây là mô hình legacy cần được migrate dần:

- `quiz` → `Exam`;
- `target_user_ids` / `is_global` → `ExamAssignment`;
- `PATCH /api/quizzes` với `score` → `POST /api/attempts/:id/submit`;
- `high_score` → kết quả của từng `Attempt` và các thống kê được tính từ attempt;
- `attemptSeed` và lấy mẫu phía client → snapshot/question order do backend tạo khi bắt đầu attempt.

Trong giai đoạn chuyển tiếp, endpoint legacy không được dùng làm cơ sở cho đặc tả business mới. Lộ trình: [migration-legacy.md](../migration-legacy.md).
