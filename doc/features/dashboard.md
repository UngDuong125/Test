# Dashboard & làm bài

## 1. Mục đích

Dashboard là không gian làm bài của student. Người dùng xem các `ExamAssignment` thuộc quyền của mình, bắt đầu một `Attempt`, trả lời câu hỏi, nộp bài và xem kết quả theo quyền được cấu hình trên assignment.

Dashboard không tự tạo đề, không tự chọn lại câu hỏi và không tự quyết định điểm. Nội dung đề được quản lý bởi `Exam`; quyền truy cập và giới hạn làm bài được quản lý bởi `ExamAssignment`; lịch sử và kết quả được lưu trong `Attempt`.

## 2. Luồng student

Ngân sách request và hình payload: [student-response.md](./student-response.md). Đoạn dưới là nghiệp vụ; số lần gọi API làm theo hợp đồng đó.

1. Đăng nhập → vào `/dashboard` (không có session → redirect `/login`). Session lấy một lần cho cả header và trang, không gọi `/api/auth/me` riêng ở dashboard.
2. Một `GET /api/students/me/assignments`. Response của từng dòng đã có `remainingAttempts`, `inProgressAttemptId` và `latestFinishedAttempt`. Không gọi `GET /api/exam-assignments/:id/attempts` cho từng đề.
3. Vẽ danh sách ngay. `GET /api/students/me/stats`, `me/exp` và `me/classes` chạy sau, lỗi của chúng không chặn danh sách hay nút làm bài.
4. Hàng bài hiện trạng thái `available`, `in_progress`, `completed` hoặc `expired` bằng nhãn tiếng Việt. Mã trạng thái không hiện cho học sinh. Trên hàng đã có tiêu đề, hạn, `attemptLimit` và `remainingAttempts`.
5. **Tiếp tục** mở `GET /api/attempts/:id` một lần. **Bắt đầu** gọi `POST /api/exam-assignments/:id/attempts`; body POST đã là attempt detail (snapshot, câu đã lưu, `serverNow`, `expiresAt`), trang làm bài không refetch nếu vừa nhận body đó.
6. Student trả lời và lưu từng `Answer`. Lưu không refetch attempt và không chặn phím khi request trước còn chạy.
7. **Nộp bài** chỉ chuyển sang kết quả khi `POST /api/attempts/:id/submit` thành công.
8. Kết quả theo `showResult` (điểm, đúng/sai). Đáp án/lời giải chỉ hiện khi `showExplanation` **và** học sinh đã hết lượt (`remainingAttempts = 0`); còn lượt thì khóa đáp án để tránh xem key rồi làm lại.

## 3. Điều kiện hiển thị assignment

`GET /api/students/me/assignments` trả danh sách assignment của student (kể cả `cancelled` / `expired` nếu còn trong DB), mỗi dòng kèm số lượt còn lại và attempt đang làm. UI chỉ bật nút sau khi payload này về.

- Có `inProgressAttemptId`: nút **Tiếp tục**, không hiện **Bắt đầu**.
- Không có attempt đang làm, status `available` hoặc `in_progress`, và `remainingAttempts > 0`: nút **Bắt đầu**.
- `remainingAttempts = 0` và không còn bài đang làm: không có nút bắt đầu.

Điều kiện **bắt đầu attempt** mới (backend):

- assignment thuộc user (`targetType=user`, `targetId=studentId`); assignment tạo từ lớp vẫn là bản ghi per-student sau expand;
- exam đang `published`; assignment không `cancelled`;
- thời điểm hiện tại ≥ `availableFrom` và chưa quá `deadline`;
- còn lượt làm, hoặc đang tiếp tục attempt `in_progress`.

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

Các loại đã bật thêm trên UI: `multiple_select`, `numeric`. `matching` / `ordering` chưa có UI làm bài.

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
- Chỉ hiển thị đáp án đúng / explanation khi `showExplanation` và đã hết `attemptLimit`; còn lượt thì chỉ đúng/sai (nếu `showResult`).
- Feedback teacher theo setting của assignment và trạng thái attempt.

## 7. API

| Method | Endpoint | Mục đích |
| :--- | :--- | :--- |
| `GET` | `/api/students/me/assignments` | Assignment của student, kèm `remainingAttempts`, `inProgressAttemptId`, `latestFinishedAttempt`. Đây là request duy nhất để vẽ hàng bài |
| `GET` | `/api/students/:id/assignments` | Teacher/admin (hoặc chính student) xem assignment theo `id` |
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

- Danh sách assignment có nhãn tiếng Việt tương ứng `assigned` (Chưa mở), `available` (Còn lượt), `in_progress` (Đang làm), `completed` (Đã xong), `expired` (Hết hạn), `cancelled` (Đã hủy).
- Khu vực làm bài hiển thị progress, timer thời lượng đề (`Exam.duration > 0`) hoặc “Không giới hạn” (`duration = 0`), hạn assignment, sections và trạng thái đã trả lời.
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
| Tốc độ luồng học sinh | `doc/features/student-response.md` |
| Manual grading | `doc/features/manual-grading.md` |
| Question | `doc/features/question-management.md` |

## 10. Tương thích với implementation hiện tại

Dashboard dùng mô hình đích: `GET /api/students/me/assignments` để liệt kê đề được giao, `POST /api/exam-assignments/:id/attempts` để bắt đầu attempt (backend tạo snapshot và thứ tự câu), `PATCH /api/attempts/:id/answers` và `POST /api/attempts/:id/submit` để lưu và nộp bài. Mô hình legacy (`/api/quizzes`, `high_score`, lấy mẫu câu phía client) đã bị loại khỏi code; lộ trình cũ ở [migration-legacy.md](../migration-legacy.md) chỉ để tham chiếu.

Danh sách bài, nút làm bài và đồng hồ làm theo [student-response.md](./student-response.md): một payload assignment, stats/EXP/lớp tải sau.
