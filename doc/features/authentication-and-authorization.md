# Feature: Đăng nhập và phân quyền

## 1. Mục tiêu

Cung cấp xác thực tài khoản bằng **email hoặc tên đăng nhập** cùng mật khẩu, đồng thời giới hạn dữ liệu và thao tác theo vai trò `admin`, `teacher` và `student`.

Feature bao gồm:

- Đăng nhập bằng email **hoặc** username + mật khẩu (cùng một endpoint).
- Admin tạo tài khoản mới bằng email và username.
- Hệ thống sinh mật khẩu tạm thời và gửi thông tin kích hoạt qua email.
- Bắt buộc đổi mật khẩu tạm thời ở lần đăng nhập đầu tiên.
- Cấp lại mật khẩu qua email khi người dùng quên mật khẩu.
- Kiểm tra quyền ở backend cho mọi API bảo vệ.

## 2. Vai trò và quyền

| Role | Quyền chính |
| :--- | :--- |
| `admin` | Quản lý tài khoản, gán vai trò, quản lý nội dung và cấu hình hệ thống |
| `teacher` | Quản lý câu hỏi/đề trong phạm vi được cấp, giao đề và chấm bài |
| `student` | Xem assignment của mình, làm bài và xem kết quả được phép |

Nguyên tắc phân quyền:

- Backend là nơi quyết định quyền; frontend chỉ dùng để ẩn/hiện giao diện.
- Mọi request bảo vệ phải xác thực session/token trước khi kiểm tra role.
- Student chỉ được truy cập tài nguyên gắn với chính mình.
- Teacher không được tự thay đổi role, tài khoản hoặc dữ liệu ngoài phạm vi được cấp.
- Admin có thể khóa tài khoản; tài khoản bị khóa không thể đăng nhập hoặc gọi API bảo vệ.
- Không dùng username, email hoặc `userId` do client gửi lên để thay thế danh tính trong token/session sau khi đã đăng nhập.

## 3. Trạng thái tài khoản

```text
invited → active → locked
          └──────→ disabled
```

- `invited`: đã tạo tài khoản nhưng chưa hoàn tất kích hoạt.
- `active`: được phép đăng nhập và sử dụng chức năng theo role.
- `locked`: bị khóa tạm thời do quá nhiều lần đăng nhập sai; cần admin mở khóa hoặc chờ thời gian khóa kết thúc.
- `disabled`: bị vô hiệu hóa bởi admin.

## 4. Tạo tài khoản qua email

### Luồng admin

```text
Admin nhập email + username + role
        ↓
Backend kiểm tra email và username chưa tồn tại, role hợp lệ
        ↓
Tạo user ở trạng thái invited
        ↓
Sinh mật khẩu tạm thời một lần
        ↓
Lưu mật khẩu đã hash và gửi email mời (kèm username)
        ↓
Người dùng đăng nhập bằng email hoặc username + mật khẩu tạm
        ↓
Bắt buộc đặt mật khẩu mới và chuyển sang active
```

Quy tắc:

- Email được chuẩn hóa và unique không phân biệt hoa thường (`citext`).
- Username unique không phân biệt hoa thường (`citext`); format: 3–32 ký tự, bắt đầu bằng chữ/số, sau đó chỉ `[A-Za-z0-9._-]`, không chứa `@`.
- Mật khẩu tạm thời phải có thời hạn, chỉ dùng một lần và không được lưu dạng plaintext.
- Email mời chứa username, hướng dẫn đăng nhập và mật khẩu tạm — không ghi mật khẩu vào log ứng dụng.
- Nếu email gửi thất bại, tài khoản không được xem là đã kích hoạt; admin có thể gửi lại lời mời.
- Token kích hoạt có thời hạn và bị vô hiệu sau khi sử dụng.
- Không cho admin tạo tài khoản với role không được hỗ trợ.

## 5. Đăng nhập và phiên làm việc

- Người dùng đăng nhập bằng **email hoặc username** cùng mật khẩu.
- Client gửi field `login` (chuỗi định danh). Backend: nếu chuỗi chứa `@` thì tra `users.email`, ngược lại tra `users.username`.
- Backward compatible: body vẫn chấp nhận `email` hoặc `username` thay cho `login`.
- Backend trả về session/token có thời hạn, chứa tối thiểu `userId`, `role` và thời điểm hết hạn.
- Session lưu bảng `sessions` (token hash, `expires_at`, `revoked_at`); cookie `HttpOnly` chỉ mang session id/token reference.
- Token được gửi qua cookie `HttpOnly`, `Secure` ở production và `SameSite=Lax` hoặc nghiêm ngặt theo deployment.
- Không lưu mật khẩu hoặc token nhạy cảm trong `localStorage`.
- Sau khi đăng nhập, nếu `mustChangePassword = true`, chỉ cho phép gọi các API đổi mật khẩu/đăng xuất cho tới khi hoàn tất.
- Đăng xuất phải hủy session hiện tại.
- Các lỗi đăng nhập không tiết lộ email/username có tồn tại hay không.
- Giới hạn tốc độ đăng nhập và khóa tạm thời sau nhiều lần sai liên tiếp.

## 6. Đổi và đặt lại mật khẩu

- Mật khẩu mới phải đạt chính sách tối thiểu về độ dài và không trùng mật khẩu tạm gần nhất.
- Khi đổi mật khẩu, hủy các session cũ để giảm rủi ro session bị lộ.
- Luồng quên mật khẩu vẫn dựa trên **email** (gửi reset token một lần).
- Reset token có thời hạn, được lưu dưới dạng hash và bị vô hiệu sau khi dùng.
- Không gửi mật khẩu hiện tại qua email và không cho admin xem mật khẩu của người dùng.

## 7. API

| Method | Endpoint | Mục đích | Quyền |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/auth/login` | Đăng nhập bằng email hoặc username + mật khẩu | Public |
| `POST` | `/api/auth/logout` | Hủy session hiện tại | Authenticated |
| `GET` | `/api/auth/me` | Lấy user và role của session hiện tại | Authenticated |
| `POST` | `/api/auth/change-password` | Đổi mật khẩu, gồm lần đầu đăng nhập | Authenticated |
| `POST` | `/api/auth/forgot-password` | Gửi email đặt lại mật khẩu | Public |
| `POST` | `/api/auth/reset-password` | Đặt mật khẩu từ reset token | Public với token hợp lệ |
| `POST` | `/api/admin/users/invite` | Tạo tài khoản và gửi email mời | `admin` |
| `POST` | `/api/admin/users/:id/resend-invite` | Gửi lại email kích hoạt | `admin` |
| `PATCH` | `/api/admin/users/:id/status` | Khóa/mở khóa/vô hiệu hóa tài khoản | `admin` |
| `PATCH` | `/api/admin/users/:id/role` | Gán role | `admin` |

Request đăng nhập:

```json
{ "login": "student1", "password": "…" }
```

hoặc

```json
{ "login": "student@example.com", "password": "…" }
```

Response đăng nhập tối thiểu:

```json
{
  "user": {
    "id": "user_001",
    "email": "student@example.com",
    "username": "student1",
    "displayName": null,
    "role": "student",
    "mustChangePassword": true
  },
  "expiresAt": "2026-09-05T12:00:00Z"
}
```

Invite body tối thiểu: `{ "email", "username", "role", "displayName?" }`.

`displayName` map từ `users.display_name` (nullable). Schema: [database-target.md](../database-target.md).

## 8. Acceptance Criteria

- Người dùng hợp lệ đăng nhập được bằng email **hoặc** username cùng mật khẩu.
- Tài khoản mới tạo qua email nhận được lời mời (kèm username) và mật khẩu tạm không thể dùng lại sau khi đổi mật khẩu.
- Lần đăng nhập đầu tiên bị giới hạn cho tới khi đặt mật khẩu mới.
- Admin tạo được tài khoản với username unique, gán role, gửi lại lời mời và khóa/mở khóa tài khoản.
- API từ chối request không có session hợp lệ bằng `401` và từ chối role không đủ quyền bằng `403`.
- Student không xem được dữ liệu của student khác; teacher không gọi được API quản trị user.
- Mật khẩu, token kích hoạt và reset token không xuất hiện trong response hoặc log.

## 9. File liên quan

| Layer | Path |
| :--- | :--- |
| UI | `frontend/app/login/page.tsx` |
| API | `backend/src/routes/auth.routes.ts` |
| User type | `backend/src/types/domain.ts` |
| Database | `supabase/schema.sql`, [database-target.md](../database-target.md) |
