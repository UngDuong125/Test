# TestArchive — Feature Documentation

Bộ tài liệu feature cho hệ thống tạo bài học, ngân hàng câu hỏi, bộ đề và phân phối đề cho học sinh THCS.

- Tổng quan: [overview.md](./overview.md)
- Cấu trúc: [structure.md](./structure.md)
- Quy ước: [features/_cross-cutting.md](./features/_cross-cutting.md)
- Schema đích: [database-target.md](./database-target.md)
- Migrate legacy (P3): [migration-legacy.md](./migration-legacy.md)
- SQL: [`supabase/`](../supabase/README.md)

## Phạm vi

0. [_cross-cutting.md](./features/_cross-cutting.md) — Quy ước API, trạng thái, timer, EXP
1. [authentication-and-authorization.md](./features/authentication-and-authorization.md) — Đăng nhập và phân quyền
2. [question-management.md](./features/question-management.md) — Quản lý câu hỏi
3. [question-bank.md](./features/question-bank.md) — Ngân hàng câu hỏi
4. [media-upload.md](./features/media-upload.md) — Upload ảnh Cloudinary
5. [exam-management.md](./features/exam-management.md) — Quản lý bộ đề (kể cả generate)
6. [class-management.md](./features/class-management.md) — Quản lý lớp
7. [exam-distribution.md](./features/exam-distribution.md) — Phân phối/giao đề
8. [attempt-and-result.md](./features/attempt-and-result.md) — Làm bài và chấm tự động
9. [manual-grading.md](./features/manual-grading.md) — Chấm thủ công
10. [dashboard.md](./features/dashboard.md) — UI làm bài học sinh
11. [exp.md](./features/exp.md) — EXP + `exp_ledger`
12. [leaderboard.md](./features/leaderboard.md) — Bảng xếp hạng (all-time + seasonal)
13. [analytics.md](./features/analytics.md) — Thống kê câu hỏi / đề / lớp

## Nguyên tắc kiến trúc

```text
Subject → Topic
       └── Question Bank → Question (+ Media)
                  │
                  └──────────────┐
                                 ▼
                              Exam
                                 │
                                 ▼
                          Exam Assignment (per student)
                                 │
                                 ▼
                              Attempt → Answer → EXP (ledger) → Leaderboard
```

### Các entity chính

- `Question` / `QuestionOption` / `QuestionBank` / `Media`
- `Exam` / `ExamAssignment` / `Class`
- `Attempt` / `Answer` / `exp_ledger`

## Quy tắc quan trọng

- `ExamAssignment` trung gian giữa đề và học sinh; giao lớp → expand per student.
- EXP: nguồn truth `exp_ledger`; `users.*_exp` là projection.
- Legacy `/api/quizzes` chỉ giai đoạn migrate — xem [migration-legacy.md](./migration-legacy.md).
- API đích: prefix `/api/`, resource `exam-assignments`.

## Trạng thái thống nhất

| Entity | Trạng thái |
| :--- | :--- |
| Question | `draft` → `review` → `published` → `archived` |
| Exam | `draft` → `published` → `archived` |
| ExamAssignment | `assigned`, `available`, `in_progress`, `completed`, `expired`, `cancelled` |
| Attempt | `in_progress`, `submitted`, `needs_grading`, `graded`, `expired`, `cancelled` |
| User | `invited`, `active`, `locked`, `disabled` |
