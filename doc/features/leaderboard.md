# Bảng xếp hạng

## 1. Mục đích

Leaderboard hiển thị thứ hạng student dựa trên tổng EXP đã được ghi nhận từ các `Attempt` hoàn tất. Đây là thống kê tiến trình, không phải danh sách điểm của từng attempt và không dựa trên kỷ lục chung của `Exam`.

Trang: `/leaderboard`.

## 2. Luồng dữ liệu

1. Backend xác thực và chấm `Attempt`.
2. Backend tạo một bản ghi `exp_ledger` idempotent cho attempt đã hoàn tất; projection `users.*_exp` cập nhật từ ledger.
3. Hệ thống tổng hợp EXP theo user và subject (từ ledger hoặc projection).
4. `GET /api/leaderboard` trả về thứ hạng đã tính sẵn hoặc được aggregate từ các bản ghi EXP.

Leaderboard không đọc score từ frontend và không cộng EXP khi chỉ mở đề, lưu answer, hoặc bắt đầu attempt.

## 3. Công thức xếp hạng

```text
subject_exp = Σ expEarned của các attempt hợp lệ trong subject
total_exp   = Σ subject_exp của các subject
```

| Rule | Chi tiết |
| :--- | :--- |
| Đối tượng | Student/user hợp lệ; không hiển thị admin hoặc service account |
| Nguồn điểm | EXP đã ghi nhận từ attempt `graded`/hoàn tất |
| Sắp xếp | `total_exp` giảm dần |
| Tie-break | `total_exp` bằng nhau → `updatedAt` gần nhất, sau đó `userId` tăng dần |
| Giới hạn | Mặc định top 20; backend áp dụng giới hạn |
| Quyền xem | Bảng tổng hợp có thể công khai; chi tiết attempt chỉ user/teacher có quyền xem |

Nếu một attempt được chấm lại, aggregate phải phản ánh đúng policy điều chỉnh EXP và không tạo bản ghi cộng trùng.

## 4. Dữ liệu trả về

```json
{
	"rank": 1,
	"userId": "student_001",
	"displayName": "Nguyễn Văn A",
	"email": "student@example.com",
	"totalExp": 120,
	"subjectExp": {
		"math": 60,
		"lang": 20,
		"flang": 10,
		"sci": 15,
		"hist_geo": 10,
		"civic": 5
	}
}
```

`displayName` map từ `users.display_name` (nullable); UI fallback → local-part của `email`. Không dùng `username` — đăng nhập bằng `email`. Schema: [database-target.md](../database-target.md).

Tên field API có thể dùng `camelCase`; frontend không nên tự cộng các cột để quyết định thứ hạng.

## 5. Cột môn và nhãn UI

Khớp `TAG_MAP` trong `frontend/constants/tags.ts`:

| Key | Nhãn |
| :--- | :--- |
| `math` | Toán |
| `lang` | Ngôn ngữ |
| `flang` | Ngoại ngữ |
| `sci` | Khoa học |
| `hist_geo` | Lịch sử - Địa lý |
| `civic` | Giáo dục công dân |

## 6. API

| Method | Endpoint | Mục đích |
| :--- | :--- | :--- |
| `GET` | `/api/leaderboard?limit=20` | Lấy bảng xếp hạng tổng hợp |
| `GET` | `/api/leaderboard?subjectId=math&limit=20` | Lấy bảng xếp hạng theo môn |
| `GET` | `/api/students/:id/exp` | Xem EXP của một student nếu có quyền |

API phải tính thứ hạng sau khi áp dụng filter, giới hạn và tie-break; không trả toàn bộ user rồi để frontend `.slice(0, 20)`.

## 7. UI

- Hiển thị hạng, tên hiển thị (hoặc email), tổng EXP và EXP theo môn.
- Có empty state: *“Chưa có dữ liệu xếp hạng.”*
- Có loading và error state.
- Có thể lọc theo môn nếu backend hỗ trợ.
- Không hiển thị điểm/answer key của người khác.
- Link tới dashboard chỉ dành cho thao tác làm bài; link tới result phải kiểm tra quyền truy cập.

## 8. File liên quan

| Layer | Path |
| :--- | :--- |
| UI | `frontend/app/leaderboard/page.tsx` |
| API | `backend/src/server.ts` → leaderboard route |
| EXP policy | `doc/features/exp.md` |
| Attempt/result | `doc/features/attempt-and-result.md` |
| Tags | `frontend/constants/tags.ts` |

## 9. Tương thích với implementation hiện tại

Implementation hiện tại dùng `GET /api/leaderboard`, tổng hợp trực tiếp các cột `*_exp` trên `users` và giới hạn ở backend/frontend hiện có. Đây là cách lưu aggregate legacy có thể giữ trong giai đoạn chuyển tiếp, nhưng nguồn tạo EXP phải được chuyển sang kết quả `Attempt`.

Các điểm cần migrate:

- `/api/leaderboard` → API leaderboard có filter/limit rõ ràng;
- `users.*_exp` → aggregate từ `exp_ledger` (schema đích); giữ cột legacy trong migrate.
- thứ tự hòa điểm phụ thuộc query DB → tie-break xác định;
- `.slice(0, 20)` ở frontend → limit và rank do backend trả về.
