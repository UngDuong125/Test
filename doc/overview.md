# Tổng quan dự án

## TestArchive là gì?

**TestArchive** là hệ thống tạo, phân phối và làm bài học tập cho học sinh THCS. Hệ thống hỗ trợ nhiều loại câu hỏi, ngân hàng câu hỏi có thể tái sử dụng, bộ đề theo môn/lớp/chủ đề, giao đề có giới hạn và theo dõi kết quả từng lần làm bài.

Các feature chính:

- Quản lý câu hỏi có nội dung rich content (text, LaTeX, hình ảnh), đáp án, lời giải và vòng đời draft/review/published/archived.
- Tổ chức câu hỏi vào **Question Bank**, tìm kiếm/lọc và chọn câu thủ công hoặc ngẫu nhiên để tạo đề.
- Quản lý **Exam** theo section, thứ tự câu, điểm số, thời lượng, loại đề và trạng thái xuất bản.
- Tạo **ExamAssignment** cho từng học sinh hoặc lớp, kèm thời gian mở, deadline, số lần làm và quyền hiển thị kết quả.
- Cho phép học sinh tạo **Attempt**, lưu **Answer**, nộp bài và xem kết quả theo quyền của assignment.
- Tự động chấm các dạng câu hỏi phù hợp; chuyển câu tự luận hoặc câu cần đánh giá nội dung sang teacher chấm thủ công.
- Ghi nhận EXP sau khi attempt được backend chấm hoàn tất và tổng hợp bảng xếp hạng theo môn.

Luồng nghiệp vụ chính:

```text
Subject / Topic
	↓
Question Bank → Question
	↓
     Exam
	↓
Exam Assignment (student / class)
	↓
    Attempt → Answer → Result / EXP
```

Tên workspace npm: `test-archive-workspace`.

## Tech stack

| Thành phần | Công nghệ | Ghi chú |
| :--- | :--- | :--- |
| Frontend | Next.js 14 (App Router), React 18, Tailwind CSS | `frontend/`, port **3000** |
| Backend | Express 4 + TypeScript (`tsx` khi dev) | `backend/src/server.ts`, port **4000** |
| Database | Supabase (PostgreSQL) | Schema: `supabase/schema.sql` |
| Auth | Email + mật khẩu, session/token và RBAC | Cookie `HttpOnly`; tài khoản mới dùng mật khẩu tạm gửi qua email và bắt buộc đổi ở lần đầu |
| Ảnh câu hỏi | Cloudinary (upload ký từ backend) | `POST /api/upload` |
| ORM | Không dùng | Truy vấn qua `@supabase/supabase-js` (service role) |

## Vai trò người dùng

| Role | Quyền chính |
| :--- | :--- |
| `admin` | Quản trị người dùng, nội dung, đề và quyền hệ thống |
| `teacher` | Tạo/sửa/chấm câu hỏi, tạo/publish đề, giao đề (exam/lớp mình quản lý) và xem kết quả học sinh |
| `student` | Xem assignment của mình, làm bài, nộp attempt và xem kết quả được phép |
Chi tiết về đăng nhập, mật khẩu tạm, tạo tài khoản qua email và phân quyền nằm trong [Authentication & Authorization](features/authentication-and-authorization.md).

Người dùng không được truy cập assignment của người khác. Chỉ exam đã `published` mới được giao; việc kiểm tra quyền truy cập đi qua `ExamAssignment`, không gắn trực tiếp danh sách đề vào `User` hoặc exam.

## Mô hình nghiệp vụ

| Entity | Vai trò |
| :--- | :--- |
| `Question` | Câu hỏi tái sử dụng, có loại câu, nội dung, đáp án, điểm và lời giải |
| `QuestionBank` | Tập câu hỏi để tìm kiếm, lọc và tạo đề |
| `Exam` | Bộ đề gồm các câu hỏi theo section, thứ tự và điểm số |
| `ExamAssignment` | Metadata giao đề: đối tượng nhận, deadline, attempt limit và setting hiển thị |
| `Attempt` | Một lần học sinh làm đề, giữ snapshot/version của nội dung |
| `Answer` | Câu trả lời và điểm đạt được cho từng câu trong attempt |

Các attempt đã bắt đầu phải giữ snapshot hoặc version của exam/question để việc sửa đề sau đó không làm thay đổi kết quả lịch sử.

## Chấm điểm và EXP

Backend là nơi duy nhất xác thực answer và tính điểm:

```text
score      = Σ pointsEarned
percentage = score / maxScore * 100
```

EXP chỉ được ghi nhận một lần sau khi attempt hợp lệ ở trạng thái hoàn tất/`graded`. EXP thuộc về kết quả của từng attempt, không dựa trên `Exam.highScore`, không lấy score do frontend gửi lên và không cộng khi chỉ mở đề hoặc lưu answer. Leaderboard sắp xếp theo tổng EXP, đồng thời hiển thị EXP theo từng môn.

## Trạng thái chính

- **Question:** `draft` → `review` → `published` → `archived`.
- **Exam:** `draft` → `published` → `archived`.
- **Assignment:** `assigned`, `available`, `in_progress`, `completed`, `expired`, `cancelled`.
- **Attempt:** `in_progress`, `submitted`, `needs_grading`, `graded`, `expired`, `cancelled`.

## Trạng thái implementation

Tài liệu feature mô tả mô hình đích của hệ thống. Implementation hiện tại vẫn đang chuyển tiếp từ mô hình legacy:

- `quizzes.questions` còn lưu câu hỏi nhúng thay vì Question/QuestionBank riêng.
- `target_user_ids` và `is_global` đang đại diện tạm thời cho việc phân phối đề.
- `PATCH /api/quizzes` vẫn cập nhật `high_score` và EXP từ score gửi bởi frontend.
- Bảng `users.*_exp` và leaderboard hiện là aggregate legacy; lịch sử `Attempt` chưa được lưu đầy đủ.

Khi migrate, submit/grade attempt và tính EXP phải được thực hiện ở backend, có kiểm tra quyền, snapshot và idempotency.

## Môn học (tag)

| Key | Nhãn |
| :--- | :--- |
| `math` | Toán |
| `lang` | Ngôn ngữ |
| `flang` | Ngoại ngữ |
| `sci` | Khoa học |
| `hist_geo` | Lịch sử - Địa lý |
| `civic` | Giáo dục công dân |

Định nghĩa tại `frontend/constants/tags.ts` và type `TagKey` trong `backend/types/domain.ts`.
