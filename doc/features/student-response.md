# Tốc độ phản hồi — luồng học sinh

Tài liệu này là hợp đồng của các màn học sinh dùng mỗi ngày: dashboard, làm bài, nộp bài, xem kết quả và ôn từ. Code hiện tại làm theo hợp đồng này. Khi mô tả ở file feature khác lệch với file này, làm theo file này.

Mục tiêu: sau khi process API đã thức, học sinh thấy danh sách bài hoặc đề đang làm sau **một** response nghiệp vụ, và số query không tăng theo số đề hay số câu.

Giới hạn đo: thời gian handler khi process đang chạy. Cold start của Render Free nằm ở [mục 8](#8-process-api-phải-thức-trong-giờ-học); tối ưu query không cứu được request đầu nếu process đang ngủ.

## 1. Phạm vi

| Trong hợp đồng | Ngoài hợp đồng |
| :--- | :--- |
| `/dashboard` của `student` | Soạn câu, soạn đề, giao đề |
| `/attempts/[id]` khi đang làm | Hàng đợi chấm, analytics giáo viên |
| `/results/[id]` lần mở đầu sau khi nộp | Leaderboard đầy đủ |
| `/vocabulary/review` | Trang admin |

Teacher và admin được phép nhiều query hơn trên cùng resource. Ngân sách dưới đây chỉ áp dụng khi `actor.role = student` và học sinh là chủ tài nguyên.

## 2. Ngân sách request trước khi có nội dung

Mỗi dòng là số request nghiệp vụ cho phép **trước lần vẽ có nội dung** (danh sách bài, đề, hoặc thẻ từ đầu tiên). `GET /api/auth/me` tính riêng ở [mục 3](#3-session-một-lần-mỗi-lần-tải-trang) và không được gọi lại trong các dòng này.

| Màn | Được gọi | Cấm trước lần vẽ đầu |
| :--- | :--- | :--- |
| Dashboard | `GET /api/students/me/assignments` | `GET /api/exam-assignments/:id/attempts` theo từng đề; chặn danh sách để chờ `me/stats`, `me/exp`, `me/classes` |
| Làm bài (mở URL hoặc bấm Tiếp tục) | `GET /api/attempts/:id` | Request thứ hai để lấy giờ, đáp án đã lưu, hoặc snapshot |
| Bắt đầu bài | `POST /api/exam-assignments/:id/attempts` | Dựng snapshot lần nữa nếu đã có attempt `in_progress`; refetch toàn bộ attempt sau POST nếu body POST đã là attempt detail |
| Mỗi lần lưu câu | `PATCH /api/attempts/:id/answers` | `GET /api/attempts/:id` sau mỗi lần lưu |
| Kiểm tra tức thì (đề `lesson`) | `POST /api/attempts/:id/check` | Refetch attempt để biết đúng/sai; response check là đủ |
| Nộp bài | `POST /api/attempts/:id/submit` | Điều hướng sang kết quả khi POST lỗi |
| Kết quả | `GET /api/attempts/:id` **hoặc** `GET /api/attempts/:id/result`, đúng một trong hai | Gọi cả hai trước khi vẽ điểm |
| Ôn từ | `GET /api/students/me/vocabulary/due` | Chặn thẻ đầu để chờ `me/vocabulary/stats` |

Sau lần vẽ đầu, stats, EXP và lớp được tải thêm. Lỗi của chúng không xóa danh sách bài và không tắt nút làm bài.

## 3. Session: một lần mỗi lần tải trang

### Client

- Một `SessionProvider` bọc app trong `frontend/app/layout.tsx`. `AppHeader`, `AuthGate` và mọi trang đọc cùng state.
- Một lần tải trang chỉ có một `GET /api/auth/me`. Đăng nhập và đổi mật khẩu ghi thẳng user trả về, không gọi `/me` thêm.
- `401` xóa user và đưa về `/login`. Không tự retry vòng lặp.

### Server

- `authMiddleware` đọc session và user bằng **một** query: `sessions` theo `token_hash` nối `users`. Không gọi `resolveSession` rồi `findUserById` nối tiếp.
- Không cache user giữa các request. Logout, khóa tài khoản và `mustChangePassword` phải có hiệu lực ở request kế tiếp.
- `token_hash` đã unique (`sessions_token_hash_unique`). Giữ index đó.

## 4. Dashboard

`GET /api/students/me/assignments` là payload duy nhất để vẽ hàng bài. Mỗi item giữ các field assignment hiện có, và **bắt buộc** thêm:

```json
{
  "id": "assignment_001",
  "examTitle": "Ôn tập chương 1",
  "status": "available",
  "attemptLimit": 2,
  "deadline": "2026-11-06T10:00:00.000Z",
  "remainingAttempts": 1,
  "inProgressAttemptId": null,
  "latestFinishedAttempt": {
    "id": "attempt_001",
    "status": "graded",
    "percentage": 80
  }
}
```

`remainingAttempts` là số, không được bỏ qua. `inProgressAttemptId` và `latestFinishedAttempt` là `null` khi không có. `latestFinishedAttempt.status` thuộc `graded | needs_grading | submitted | expired`.

Cách đọc dữ liệu:

1. Một query các assignment của đúng `target_id = student`.
2. Một query các attempt của những `assignment_id` đó, chỉ cột cần cho ba field trên (`id`, `assignment_id`, `status`, `percentage`). Bỏ `cancelled`.
3. Tiêu đề đề: một query `exams` theo tập `exam_id`, không theo từng dòng.

Số query của handler này không phụ thuộc số đề. Tính `remainingAttempts` và attempt đang làm trong bộ nhớ.

UI:

- Nút **Bắt đầu** / **Tiếp tục** chỉ hiện sau khi payload này về. Không đoán từ mảng attempt rỗng.
- Có `inProgressAttemptId` thì hành động chính là **Tiếp tục** tới `/attempts/:id`. Không hiện **Bắt đầu** cùng lúc.
- `remainingAttempts = 0` và không còn attempt đang làm thì không hiện **Bắt đầu**.
- Nhãn trạng thái trên hàng bài là tiếng Việt (Chưa mở, Đang làm, Còn lượt, Hết hạn, Đã xong). Mã `available` / `in_progress` chỉ ở dữ liệu, không in ra cho học sinh.

## 5. Làm bài, lưu, nộp

### Đọc một lần

`GET /api/attempts/:id` cho đúng học sinh sở hữu:

- Kiểm tra `attempt.user_id = actor.id`. Không gọi `findExamById`, `isStudentInTeacherClass` hay các nhánh teacher.
- Sau khi có attempt: snapshot, answers và assignment (deadline, attempt limit, settings) chạy song song. Tối đa **hai** lượt đi database.
- `remainingAttempts` là một `count`, không phải tải mọi attempt rồi đếm trên ứng dụng.
- Body có thêm `serverNow` (ISO, giờ server lúc trả response) và `expiresAt` của attempt. Client không gọi thêm để lấy giờ.

Đồng hồ trên UI:

```text
receivedAt = Date.now() lúc nhận response
remainingMs = expiresAt - serverNow - (Date.now() - receivedAt)
```

Tick mỗi giây chỉ để vẽ. Không poll API. `duration = 0` vẫn hiện hạn assignment từ cùng `expiresAt`.

### Bắt đầu

`POST /api/exam-assignments/:id/attempts`:

- Đã có attempt `in_progress` của học sinh đó thì trả lại attempt đó. Không dựng snapshot mới.
- Chưa có: ghi attempt và snapshot xong rồi mới trả. Snapshot lỗi thì attempt đó không được tính vào `attemptLimit` (xóa trong cùng luồng, hoặc một transaction).
- Body giống `GET /api/attempts/:id` (kèm `serverNow`). Trang làm bài dùng body này khi vừa tạo; mở URL trực tiếp thì một `GET` như mục trên.
- Database có đúng một attempt `in_progress` cho mỗi `(assignment_id, user_id)`:

```sql
CREATE UNIQUE INDEX attempts_one_in_progress_idx
  ON public.attempts (assignment_id, user_id)
  WHERE status = 'in_progress';
```

Migration mới trong `supabase/migrations/`. Không sửa migration cũ. Hai request song song: một request thành công, request kia nhận attempt đang làm (đọc lại sau unique violation), không tạo snapshot thứ hai.

### Lưu câu

- Ô chọn (một đáp án, nhiều đáp án, đúng/sai, nối, sắp xếp) gửi ngay. Ô chữ debounce 400ms. Gõ tiếp không chờ response trước.
- Mỗi câu có một chuỗi lưu: request sau chờ request trước của **cùng câu**, không chờ câu khác.
- Response `PATCH` chỉ cần xác nhận đã ghi. Client không thay snapshot từ response đó.
- `pagehide`: flush các câu đang debounce bằng `fetch` với `keepalive: true`.
- Lưu lỗi thì giữ câu trên màn và hiện lỗi. Không xóa ô học sinh đang gõ.

### Nộp

- Flush mọi câu đang chờ, rồi `POST /api/attempts/:id/submit`.
- Chỉ `router` sang `/results/:id` khi POST trả 2xx.
- POST lỗi: ở lại trang làm bài, nút nộp bấm lại được.
- Hết `remainingMs`: cùng một đường nộp. Không chuyển trang kết quả trong nhánh `catch`.

`POST /api/attempts/:id/check` giữ contract ở [interactive-lessons.md](./interactive-lessons.md). Response check đủ để vẽ đúng/sai từng vế. Không refetch attempt.

## 6. Ôn từ

`GET /api/students/me/vocabulary/due`:

- Trả trang đầu đủ để vẽ thẻ: tối đa 30 item, cộng `dueCount` toàn bộ.
- Mỗi item có `card` và `entry` (term, definition, các field thẻ đang hiện). Lấy bằng một select có join, hoặc một query thẻ rồi một query entry theo tập id. Không query từng thẻ.
- `bankName` có thể đi cùng trang này nếu là một query theo tập `bank_id`. Không nằm trên đường chặn thẻ đầu nếu buộc phải thêm lượt.
- Hết trang và còn due thì tải trang sau khi học sinh gần hết thẻ đang có. Không tải mọi thẻ due trước thẻ đầu.

`POST /api/vocabulary-cards/:id/review` trả thẻ đã cập nhật. UI chuyển thẻ kế tiếp từ danh sách đang có. Không gọi lại `/due` sau mỗi lần thuộc hoặc chưa thuộc.

`GET /api/students/me/vocabulary/stats` chỉ phục vụ chỗ đếm phụ, sau khi thẻ đầu đã hiện.

## 7. Việc không được đưa vào luồng học sinh

- Tải stats, EXP, lớp, hoặc leaderboard trước danh sách bài.
- Suy ra nút **Bắt đầu** khi chưa có `remainingAttempts` và `inProgressAttemptId`.
- Dựng lại snapshot cho attempt đang `in_progress`.
- Chấm điểm hoặc cộng EXP trong request lưu câu. Chấm khi nộp, hoặc trong `/check` đối với đề `lesson` (điểm đó không ghi EXP).
- Thêm cache session phía server để “đỡ query”. Một query join là đủ và khỏi phục vụ user đã bị khóa.
- Thêm thư viện data-fetch mới chỉ để đạt ngân sách này. `SessionProvider` và payload gộp ở trên là đủ với stack hiện tại.

## 8. Process API phải thức trong giờ học

Hợp đồng trên giả định process Express đang chạy. Backend trên Render Free ngủ sau khoảng 15 phút không có request. Workflow `.github/workflows/keep-backend-awake.yml` hiện chỉ ping từ 16:45 đến 23:59 giờ Việt Nam, nên tiết học buổi sáng vẫn dính cold start (vài chục giây) trước mọi tối ưu query.

Khi sửa vận hành cùng đợt này: lịch ping phải phủ **06:00–22:00** `Asia/Ho_Chi_Minh`, vẫn gọi `GET /api/health`. Giữ biến repository `BACKEND_URL`.

## 9. Tiêu chí xong

- Vào `/dashboard` bằng tài khoản student: một `GET /api/auth/me` và một `GET /api/students/me/assignments` trước khi có hàng bài. Không có request attempt theo từng đề.
- Hàng có bài đang làm chỉ có **Tiếp tục**. Hàng hết lượt không có **Bắt đầu**. Hai nút không nhấp nháy vì dữ liệu tới muộn.
- Mở `/attempts/:id` đang `in_progress`: một GET, đề và câu đã lưu cùng có. Đồng hồ chạy từ `serverNow` và `expiresAt`, không có request giờ.
- Gõ một câu tự luận: mạng chậm không khóa phím. Đóng tab sau khi gõ vẫn có `PATCH` keepalive cho câu đó.
- Nộp lỗi mạng: vẫn ở trang làm bài, bấm nộp lại được.
- Bấm **Bắt đầu** hai lần liên tiếp: một attempt `in_progress`, một lần dựng snapshot.
- `/vocabulary/review`: thẻ đầu hiện từ một GET `/due`. Bấm thuộc không gọi lại cả danh sách.
- Số query của `GET /api/students/me/assignments` và `GET /api/attempts/:id` (student) không tăng khi thêm đề hoặc thêm câu vào cùng một bài.

## 10. File đã theo hợp đồng

| Việc | File |
| :--- | :--- |
| Provider session | `frontend/app/layout.tsx`, `frontend/lib/auth.tsx`, `frontend/components/auth/AuthGate.tsx`, `frontend/components/auth/AppHeader.tsx` |
| Dashboard một payload | `frontend/app/dashboard/page.tsx`, `frontend/lib/api-client.ts`, `frontend/types/content.ts` |
| Gộp attempt vào list | `backend/src/modules/assignments/assignments.service.ts`, repository assignment/attempt |
| Một query session | `backend/src/middleware/auth.ts`, `backend/src/repositories/sessions.repository.ts` |
| Đọc / bắt đầu / lưu bài | `backend/src/modules/attempts/attempts.service.ts`, `frontend/app/attempts/[id]/page.tsx` |
| Một attempt đang làm | `supabase/migrations/` (index partial mới), `doc/database-target.md` khi đã apply |
| Ôn từ theo trang | `backend/src/modules/vocabulary/vocabulary.service.ts`, `frontend/app/vocabulary/review/page.tsx` |
| Process thức giờ học | `.github/workflows/keep-backend-awake.yml` |
