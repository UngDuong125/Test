# TestArchive — Feature Documentation

Bộ tài liệu feature cho hệ thống tạo bài học, ngân hàng câu hỏi, bộ đề và phân phối đề cho học sinh THCS.

Tài liệu tổng quan: [overview.md](./overview.md). Cấu trúc dự án: [structure.md](./structure.md). Quy ước chung: [features/_cross-cutting.md](./features/_cross-cutting.md). Schema đích: [database-target.md](./database-target.md).

## Phạm vi

Các feature trong bộ này:

0. [_cross-cutting.md](./features/_cross-cutting.md) — Quy ước API, trạng thái, timer, EXP
1. [authentication-and-authorization.md](./features/authentication-and-authorization.md) — Đăng nhập email/mật khẩu, phân quyền và tạo tài khoản qua email
2. [question-management.md](./features/question-management.md) — Quản lý câu hỏi
3. [question-bank.md](./features/question-bank.md) — Ngân hàng câu hỏi
4. [exam-management.md](./features/exam-management.md) — Quản lý bộ đề
5. [exam-distribution.md](./features/exam-distribution.md) — Phân phối/giao đề
6. [attempt-and-result.md](./features/attempt-and-result.md) — Làm bài, chấm điểm và kết quả
7. [dashboard.md](./features/dashboard.md) — Giao diện làm bài của học sinh
8. [exp.md](./features/exp.md) — Ghi nhận EXP sau khi chấm attempt
9. [leaderboard.md](./features/leaderboard.md) — Bảng xếp hạng theo EXP

## Nguyên tắc kiến trúc

```text
Subject → Topic
       └── Question Bank → Question
                  │
                  └──────────────┐
                                 ▼
                              Exam
                                 │
                                 ▼
                          Exam Assignment (per student)
                                 │
                                 ▼
                              Attempt → Answer → EXP (ledger)
```

### Các entity chính

- `Question`: nội dung một câu hỏi có thể tái sử dụng.
- `QuestionOption`: lựa chọn của câu hỏi.
- `QuestionBank`: tập hợp câu hỏi.
- `Exam`: một bộ đề được cấu thành từ các câu hỏi.
- `ExamAssignment`: quan hệ giao một bộ đề cho **một học sinh** (expand từ lớp nếu cần).
- `Attempt`: một lần học sinh làm đề.
- `Answer`: câu trả lời của học sinh cho từng câu.

## Quy tắc quan trọng

- Không lưu toàn bộ câu hỏi trực tiếp vào `User`.
- Không coi việc phân phối là thuộc tính đơn giản của `Exam`.
- `ExamAssignment` là entity trung gian giữa nội dung đề và đối tượng nhận đề.
- Giao cho lớp → expand thành nhiều assignment `targetType=user` (Strategy B).
- Một `Question` có thể xuất hiện trong nhiều `Exam`.
- Kết quả của từng lần làm bài nằm ở `Attempt`, không nằm trực tiếp trong `Exam`.
- EXP: nguồn truth `exp_ledger`; `users.*_exp` là projection.
- API đích: prefix `/api/`, resource `exam-assignments`. Legacy: [overview.md](./overview.md#trạng-thái-implementation).

## Trạng thái thống nhất

Chi tiết rule chuyển trạng thái assignment/attempt: [\_cross-cutting.md](./features/_cross-cutting.md).

| Entity | Trạng thái |
| :--- | :--- |
| Question | `draft` → `review` → `published` → `archived` |
| Exam | `draft` → `published` → `archived` |
| ExamAssignment | `assigned`, `available`, `in_progress`, `completed`, `expired`, `cancelled` |
| Attempt | `in_progress`, `submitted`, `needs_grading`, `graded`, `expired`, `cancelled` |
| User (account) | `invited`, `active`, `locked`, `disabled` |
