# Feature: Class Management

## 1. Mục tiêu

Quản lý lớp học: teacher tạo lớp, thêm/bớt học sinh, dùng lớp làm nguồn khi giao đề (expand Strategy B).

Class không thay thế `ExamAssignment`. Giao đề cho lớp tạo nhiều assignment `targetType=user` — xem [exam-distribution.md](./exam-distribution.md).

## 2. Actor

| Role | Quyền |
| :--- | :--- |
| `admin` | CRUD mọi lớp; thêm bất kỳ student |
| `teacher` | CRUD lớp mình sở hữu (`ownerId`); thêm/bớt student trong lớp đó |
| `student` | Chỉ xem lớp mình đang thuộc (read-only), không tự join/leave trong MVP |

## 3. Model

### Class

```json
{
  "id": "class_8a1",
  "name": "8A1",
  "grade": 8,
  "ownerId": "teacher_001",
  "memberCount": 32,
  "createdAt": "...",
  "updatedAt": "..."
}
```

### ClassMember

```json
{
  "classId": "class_8a1",
  "userId": "student_001",
  "joinedAt": "..."
}
```

Schema: [database-target.md](../database-target.md) — bảng `classes`, `class_members`.

## 4. Quy tắc

- `name` unique trong phạm vi `ownerId` (một teacher không tạo hai lớp trùng tên).
- Chỉ user `role=student` và `status=active` mới được thêm vào lớp.
- Một student có thể thuộc nhiều lớp.
- Xóa lớp không xóa user; không xóa `exam_assignments` lịch sử (giữ `sourceClassId`).
- Teacher chỉ giao đề / xem kết quả student trong lớp mình quản lý (cùng rule với [exam-distribution.md](./exam-distribution.md#7-quyền)).

## 5. Liên kết với Exam Distribution

```text
Teacher chọn Exam + Class 8A1
        ↓
Backend đọc class_members
        ↓
Tạo exam_assignment / student (sourceClassId = class_8a1)
```

Nếu student đã có assignment trùng `(examId, targetId)` còn hiệu lực → bỏ qua hoặc trả `409` theo policy (MVP: bỏ qua với warning trong response bulk).

## 6. API

| Method | Endpoint | Mục đích | Quyền |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/classes` | Tạo lớp | `teacher`, `admin` |
| `GET` | `/api/classes` | Danh sách lớp trong phạm vi | `teacher`, `admin` |
| `GET` | `/api/classes/:id` | Chi tiết lớp + số thành viên | Owner / admin |
| `PATCH` | `/api/classes/:id` | Đổi tên, grade | Owner / admin |
| `DELETE` | `/api/classes/:id` | Xóa lớp (không xóa user) | Owner / admin |
| `GET` | `/api/classes/:id/members` | Danh sách học sinh | Owner / admin |
| `POST` | `/api/classes/:id/members` | Thêm student(s) | Owner / admin |
| `DELETE` | `/api/classes/:id/members/:userId` | Xóa student khỏi lớp | Owner / admin |
| `GET` | `/api/students/me/classes` | Lớp của student hiện tại | `student` |

### Request thêm thành viên

```json
{
  "userIds": ["student_001", "student_002"]
}
```

Hoặc theo email (admin/teacher đã biết email):

```json
{
  "emails": ["a@school.edu", "b@school.edu"]
}
```

Email không tồn tại / không phải student → `422` với danh sách lỗi từng phần; các email hợp lệ vẫn được thêm.

## 7. UI

| Path | Vai trò |
| :--- | :--- |
| `/classes` | Teacher: danh sách / tạo / sửa lớp |
| `/classes/[id]` | Thành viên, thêm/bớt, shortcut giao đề |

Student có thể thấy tên lớp trên dashboard nếu assignment có `sourceClassId` (tùy chọn UI).

## 8. Acceptance Criteria

- Teacher tạo được lớp và thêm học sinh active.
- Teacher không sửa/xóa lớp của teacher khác (`403`).
- Giao đề theo lớp tạo đúng số assignment = số thành viên hợp lệ.
- Xóa lớp không xóa attempt/assignment lịch sử.
- Student không tự thêm mình vào lớp qua API.

## 9. File liên quan

| Layer | Path |
| :--- | :--- |
| UI | `frontend/app/classes/` |
| Backend | `backend/src/modules/classes/` |
| Schema | [database-target.md](../database-target.md) |
| Distribution | [exam-distribution.md](./exam-distribution.md) |
| Quy ước | [_cross-cutting.md](./_cross-cutting.md) |
