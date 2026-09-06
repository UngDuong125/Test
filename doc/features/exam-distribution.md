# Feature: Exam Distribution

## 1. Mục tiêu

Cho phép teacher/admin giao một Exam đã publish cho một hoặc nhiều học sinh/lớp, đồng thời quản lý deadline, attempt limit và quyền truy cập.

## 2. Tại sao cần entity riêng?

Không nên:

```text
Exam.assignedUsers[]
```

và cũng không nên:

```text
User.assignedExams[]
```

Thay vào đó:

```text
User/Class
     ↕
ExamAssignment
     ↕
Exam
```

Vì việc giao đề có metadata riêng.

## 3. ExamAssignment Model

```json
{
  "id": "assignment_001",
  "examId": "exam_001",

  "targetType": "user",
  "targetId": "student_001",

  "assignedBy": "teacher_001",
  "assignedAt": "...",

  "availableFrom": "2026-09-05T00:00:00Z",
  "deadline": "2026-09-10T23:59:59Z",

  "attemptLimit": 2,

  "status": "assigned",

  "settings": {
    "shuffleQuestions": true,
    "shuffleOptions": true,
    "showResult": true,
    "showExplanation": true
  }
}
```

`settings` trên assignment **override** giá trị mặc định của `Exam` (xem [Exam Management](./exam-management.md)). `attemptLimit`, `availableFrom` và `deadline` chỉ tồn tại trên assignment, không nằm trong `Exam.settings`.

## 4. Target

MVP hỗ trợ giao cho **từng học sinh** và **cả lớp** (expand Strategy B — xem mục 6).

Bản ghi `exam_assignments` lưu trữ **luôn** `targetType = user` sau khi giao:

```text
targetType = user
targetId   = studentId
```

Khi teacher chọn lớp, backend expand thành nhiều assignment `user` (một record / học sinh). Field `sourceClassId` (optional) giữ tham chiếu lớp gốc để thống kê.

Mở rộng sau MVP:

```text
group, course, organization
```

## 5. Assignment Status

```text
assigned → available → in_progress → completed
                ↓            ↓
            expired      expired
                ↓
           cancelled
```

### Rule suy ra trạng thái

| Trạng thái | Điều kiện (theo thứ tự ưu tiên) |
| :--- | :--- |
| `cancelled` | Teacher/admin đã hủy assignment |
| `expired` | `now > deadline` và không còn attempt `in_progress` |
| `in_progress` | Có ít nhất một `Attempt` `in_progress` thuộc assignment |
| `completed` | Số attempt đã `graded`/`submitted`/`needs_grading` ≥ `attemptLimit`, hoặc hết lượt và không còn attempt đang làm |
| `available` | `availableFrom ≤ now ≤ deadline`, còn lượt làm, chưa `in_progress` |
| `assigned` | `now < availableFrom` |

Trạng thái assignment **khác** trạng thái attempt: assignment mô tả quyền truy cập tổng thể; attempt mô tả một lần làm cụ thể. Backend có thể lưu explicit `status` và/hoặc tính khi query — phải nhất quán với bảng trên.

Quy ước chung: [\_cross-cutting.md](./_cross-cutting.md).

## 6. Phân phối cho lớp

Teacher chọn lớp khi giao đề. MVP dùng **Strategy B — expand thành user assignments**:

```text
POST /api/exams/:id/assign  { targetType: "class", targetId: "class_8a1", ... }
        ↓
Backend lấy class_members
        ↓
Tạo exam_assignment cho từng student (targetType=user, sourceClassId=class_8a1)
```

```text
Class 8A1
 ├── Student A → exam_assignment (user)
 ├── Student B → exam_assignment (user)
 └── Student C → exam_assignment (user)
```

Ưu điểm: query student đơn giản (`target_type=user`), override deadline/attempt từng học sinh, thống kê rõ.

Strategy A (một assignment trỏ class) **không** dùng trong MVP.

Quản lý lớp: bảng `classes`, `class_members` — xem [database-target.md](../database-target.md).

## 7. Quyền

Giao đề thuộc quyền role (không dùng permission granular `assign_exam`):

| Role | Điều kiện |
| :--- | :--- |
| `admin` | Mọi exam đã publish |
| `teacher` | `Exam.ownerId = teacher` **hoặc** student nằm trong lớp teacher quản lý (`classes.owner_id`) |
| `student` | Không |

Không cho học sinh truy cập assignment của học sinh khác.

## 8. Assignment Rules

- Chỉ publish exam mới được giao.
- Không thể giao exam đã archived.
- `availableFrom < deadline`.
- `attemptLimit >= 1`.
- User target phải là student hợp lệ.
- Teacher chỉ được giao cho học sinh/lớp mà mình quản lý.
- Cancel assignment không xóa attempt lịch sử.
- Xóa assignment không nên xóa exam hoặc question.

## 9. API gợi ý

```text
POST   /api/exam-assignments
GET    /api/exam-assignments/:id
PATCH  /api/exam-assignments/:id
DELETE /api/exam-assignments/:id

GET    /api/exams/:id/assignments
GET    /api/students/:id/assignments

POST   /api/exam-assignments/:id/cancel
POST   /api/exam-assignments/:id/attempts      # Tạo attempt (nested)
POST   /api/exams/:id/assign                   # Bulk: user hoặc class (expand)
```

## 10. Teacher Workflow

```text
Chọn Exam
   ↓
Chọn học sinh/lớp
   ↓
Thiết lập availableFrom/deadline
   ↓
Thiết lập attemptLimit
   ↓
Review
   ↓
Assign
```

## 11. Student Workflow

```text
My Assignments
   ↓
Assignment
   ↓
View Exam
   ↓
Start Attempt
   ↓
Submit
   ↓
View Result
```

## 12. Acceptance Criteria

- Teacher có thể giao đề cho student.
- Teacher có thể giao đề cho class.
- Có deadline.
- Có thời gian bắt đầu.
- Có giới hạn số lần làm.
- Có thể hủy assignment.
- Student chỉ thấy assignment thuộc quyền của mình.
- Assignment không làm thay đổi Exam gốc.
