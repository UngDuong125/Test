# Feature: Vocabulary Spaced Repetition (SRS)

## 1. Mục tiêu

Cho phép teacher giao danh sách từ vựng cho học sinh; học sinh ôn qua flashcard theo **lặp lại ngắt quãng** (spaced repetition) với các mốc cố định:

```text
1 ngày → 3 ngày → 7 ngày → 14 ngày → 30 ngày
```

- **Thuộc** (know): đẩy sang mốc kế tiếp; từ tự xuất hiện lại khi đến hạn.
- **Không thuộc** (forget): reset về mốc đầu (1 ngày).

Học sinh có **một mục cố định** trên UI (ví dụ “Ôn từ vựng”) để vào học; danh sách flashcard due được gom từ các assignment đang hiệu lực.

## 2. Phạm vi MVP

Trong phạm vi:

- Teacher tạo / quản lý từ vựng và bộ từ (vocabulary bank).
- Teacher giao bộ từ cho học sinh hoặc lớp (expand per student — giống [exam-distribution](./exam-distribution.md)).
- Student ôn flashcard: mặt trước → lật → chọn thuộc / không thuộc.
- Lịch ôn theo mốc 1 / 3 / 7 / 14 / 30 ngày; `next_review_at` quyết định từ nào “due”.
- Student chỉ thấy / ôn assignment thuộc quyền của mình.

Ngoài phạm vi MVP (có thể mở rộng sau):

- Thuật toán SM-2 / ease factor động.
- Gõ chính tả / nghe – nói (chỉ flashcard nhận biết nghĩa).
- Cộng EXP khi ôn từ (xem mục 12).
- Import CSV / từ điển ngoài.
- Nhắc push / email khi đến hạn ôn.

## 3. Tại sao module riêng?

Không tái sử dụng `questions` / `exams` / `exam_assignments` / `attempts` vì:

| Exam flow | Vocabulary SRS |
| :--- | :--- |
| Một lần làm đề, chấm điểm | Nhiều lần ôn từng thẻ theo lịch |
| `attempt_limit`, duration, deadline nộp | `next_review_at`, interval step |
| Snapshot đề + grading | Trạng thái thẻ per student |
| `question_banks` = câu hỏi đề thi | Word bank = mục từ vựng |

Module SRS **song song** với luồng đề thi; **không sửa** bảng exam hiện có. Tái sử dụng:

- `users`, `classes`, `class_members` (giao theo lớp)
- `subjects` (thường `flang` / `lang`)
- `media` (ảnh / audio tùy chọn)
- Quy ước role teacher / student / admin ([authentication-and-authorization](./authentication-and-authorization.md))

## 4. Mô hình dữ liệu đề xuất

```text
subjects
   └── VocabularyBank (owner = teacher)
          └── VocabularyBankItem → VocabularyEntry
                                          │
VocabularyAssignment ─────────────────────┘
   (per student, optional sourceClassId)
          │
          ▼
   StudentVocabularyCard
          │  interval_step, next_review_at, …
          ▼
   VocabularyReviewEvent (optional audit)
```

### 4.1. VocabularyEntry

Một mục từ vựng tái sử dụng.

```json
{
  "id": "entry_001",
  "subjectId": "flang",
  "grade": 7,
  "term": "apple",
  "reading": null,
  "definition": "quả táo",
  "example": "I eat an apple.",
  "mediaId": null,
  "tags": ["fruit"],
  "status": "published",
  "createdBy": "teacher_001",
  "createdAt": "...",
  "updatedAt": "..."
}
```

| Field | Ý nghĩa |
| :--- | :--- |
| `term` | Mặt flashcard (từ / cụm) |
| `reading` | Phiên âm / furigana / IPA (nullable) |
| `definition` | Nghĩa hiển thị mặt sau |
| `example` | Ví dụ (nullable) |
| `mediaId` | Ảnh / audio qua [media-upload](./media-upload.md) |
| `status` | `draft` \| `published` \| `archived` |

### 4.2. VocabularyBank + VocabularyBankItem

Tương tự [question-bank](./question-bank.md): tập từ để giao bài.

```json
{
  "id": "bank_001",
  "name": "Unit 1 – Food",
  "description": "...",
  "subjectId": "flang",
  "grade": 7,
  "ownerId": "teacher_001"
}
```

Một entry có thể thuộc nhiều bank qua `vocabulary_bank_items`.

### 4.3. VocabularyAssignment

Metadata giao bộ từ — mirror tinh thần `ExamAssignment`, **bảng riêng**.

```json
{
  "id": "va_001",
  "bankId": "bank_001",
  "targetType": "user",
  "targetId": "student_001",
  "assignedBy": "teacher_001",
  "sourceClassId": "class_8a1",
  "availableFrom": "2026-09-24T00:00:00Z",
  "deadline": null,
  "status": "active",
  "assignedAt": "..."
}
```

| Field | Rule MVP |
| :--- | :--- |
| `targetType` | Luôn lưu `user` sau expand (Strategy B) |
| `sourceClassId` | Có khi giao cả lớp |
| `availableFrom` | Thời điểm HS bắt đầu ôn được |
| `deadline` | Nullable — nếu có: sau deadline không tạo card mới / không hiện trong “Ôn từ”; card đã có vẫn giữ lịch sử |
| `status` | `active` \| `completed` \| `cancelled` |

Khi assign: backend tạo (hoặc upsert) một `StudentVocabularyCard` cho mỗi entry trong bank × mỗi học sinh.

### 4.4. StudentVocabularyCard

Trạng thái SRS **per student × entry × assignment**.

```json
{
  "id": "card_001",
  "assignmentId": "va_001",
  "userId": "student_001",
  "entryId": "entry_001",
  "intervalStep": 0,
  "nextReviewAt": "2026-09-24T08:00:00Z",
  "lastReviewedAt": null,
  "reviewCount": 0,
  "passCount": 0,
  "failCount": 0,
  "status": "learning"
}
```

| Field | Ý nghĩa |
| :--- | :--- |
| `intervalStep` | `0..4` → lần lượt 1, 3, 7, 14, 30 ngày |
| `nextReviewAt` | Thời điểm thẻ trở thành **due** |
| `status` | `learning` \| `mastered` \| `suspended` |

**Unique:** `(user_id, entry_id, assignment_id)`.

Khi `intervalStep` đạt max (4 = 30 ngày) và học sinh vẫn **thuộc** ở lần ôn đó: thẻ chuyển sang `mastered` và không còn vào queue due.

### 4.5. VocabularyReviewEvent (khuyến nghị)

Audit / analytics; không bắt buộc cho logic SRS.

```json
{
  "id": "rev_001",
  "cardId": "card_001",
  "result": "pass",
  "intervalStepBefore": 1,
  "intervalStepAfter": 2,
  "reviewedAt": "..."
}
```

`result`: `pass` \| `fail`.

## 5. Lịch ôn (interval policy)

### 5.1. Bảng mốc

| `intervalStep` | Khoảng cách tới lần ôn tiếp theo |
| :---: | :--- |
| 0 | 1 ngày |
| 1 | 3 ngày |
| 2 | 7 ngày |
| 3 | 14 ngày |
| 4 | 30 ngày |

Hằng số gợi ý (backend):

```text
INTERVAL_DAYS = [1, 3, 7, 14, 30]
```

### 5.2. Khi học sinh trả lời

```text
startOfDay(d) = 00:00 của ngày d theo VOCABULARY_TIME_ZONE (mặc định Asia/Ho_Chi_Minh)

PASS (thuộc):
  nếu intervalStep = 4 (đã qua mốc 30 ngày):
    status = mastered   # rời khỏi queue due
  ngược lại:
    nextStep = intervalStep + 1
    nextReviewAt = startOfDay(today + INTERVAL_DAYS[nextStep])
    intervalStep = nextStep

FAIL (không thuộc):
  intervalStep = 0
  nextReviewAt = startOfDay(today + INTERVAL_DAYS[0])   # 0h ngày mai
```

Ngày được tính theo lịch, không theo giờ: ôn lúc 23:59 hay 00:01 thì mốc +1 ngày đều due từ 0h ngày hôm sau.

Biến thể tùy chọn (cấu hình sau): FAIL → `nextReviewAt = now` (due ngay trong cùng phiên). MVP mặc định: reset về +1 ngày.

### 5.3. Thẻ “due”

```text
due ⇔ status = learning
    ∧ nextReviewAt ≤ now
    ∧ assignment.status = active
    ∧ (assignment.availableFrom ≤ now)
    ∧ (deadline IS NULL OR now ≤ deadline)
```

UI “Ôn từ vựng” chỉ lấy thẻ due (có thể nhóm theo assignment / bank).

### 5.4. Card mới khi vừa giao

```text
intervalStep = 0
nextReviewAt = max(now, availableFrom)   # due ngay khi mở assignment
status = learning
```

## 6. Phân phối cho lớp

Giống Strategy B trong [exam-distribution](./exam-distribution.md#6-phân-phối-cho-lớp):

```text
POST /api/vocabulary-banks/:id/assign
  { targetType: "class", targetId: "class_8a1", availableFrom, deadline? }
        ↓
Backend lấy class_members (active)
        ↓
Tạo vocabulary_assignment (targetType=user, sourceClassId=…)
        ↓
Tạo student_vocabulary_cards cho mọi entry trong bank
```

Không dùng một assignment trỏ thẳng class trong MVP.

## 7. Quyền

| Role | VocabularyEntry / Bank | Assignment | Ôn flashcard |
| :--- | :--- | :--- | :--- |
| `admin` | CRUD mọi nội dung | Giao mọi bank published | — |
| `teacher` | CRUD bank/entry mình sở hữu | Giao cho HS / lớp mình quản lý | Xem tiến độ HS mình |
| `student` | Chỉ đọc entry thuộc assignment của mình | Chỉ thấy assignment của mình | Review card của mình |

- Chỉ bank có entry `published` (hoặc bank đã “ready”) mới được giao — rule cụ thể: khi assign, chỉ tạo card cho entry `status = published`.
- Student không đọc assignment / card của student khác.

## 8. API gợi ý

Prefix `/api/` theo [_cross-cutting](./_cross-cutting.md).

### Bank & entry

```text
POST   /api/vocabulary-banks
GET    /api/vocabulary-banks
GET    /api/vocabulary-banks/:id
PATCH  /api/vocabulary-banks/:id
DELETE /api/vocabulary-banks/:id

POST   /api/vocabulary-entries
GET    /api/vocabulary-entries/:id
PATCH  /api/vocabulary-entries/:id

POST   /api/vocabulary-banks/:id/items      # { entryId }
DELETE /api/vocabulary-banks/:id/items/:entryId
```

### Assignment

```text
POST   /api/vocabulary-assignments
GET    /api/vocabulary-assignments/:id
PATCH  /api/vocabulary-assignments/:id
POST   /api/vocabulary-assignments/:id/cancel

POST   /api/vocabulary-banks/:id/assign     # bulk user | class
GET    /api/students/me/vocabulary-assignments
GET    /api/students/:id/vocabulary-assignments
```

### Review (student)

```text
GET    /api/students/me/vocabulary/due      # danh sách thẻ due (+ entry payload)
POST   /api/vocabulary-cards/:id/review     # { result: "pass" | "fail" }
GET    /api/students/me/vocabulary/stats    # optional: due count, mastered, …
```

`POST .../review` chỉ chấp nhận card `userId = session`, due (hoặc đang trong phiên ôn), và cập nhật `intervalStep` / `nextReviewAt` trên **backend** — không tin interval do client gửi.

## 9. Teacher workflow

```text
Tạo / chọn VocabularyEntry
   ↓
Gom vào VocabularyBank
   ↓
Publish entries cần dùng
   ↓
Chọn học sinh hoặc lớp
   ↓
Thiết lập availableFrom (± deadline)
   ↓
Assign → tạo cards
   ↓
Theo dõi tiến độ (số thẻ due / pass rate — phase sau)
```

## 10. Student workflow

```text
Mục cố định “Ôn từ vựng”
   ↓
Danh sách thẻ due hôm nay (gom mọi assignment active)
   ↓
Flashcard: hiện term → lật definition
   ↓
Thuộc → mốc kế tiếp
Không thuộc → về mốc 1 ngày
   ↓
Hết thẻ due → thông báo “Đã xong hôm nay”
```

Không bắt buộc “làm hết một assignment trong một phiên”; SRS theo từng thẻ.

## 11. UI notes

- **Mục cố định** trên nav / dashboard học sinh (không phụ thuộc có exam assignment hay không); nếu chưa có assignment → empty state hướng dẫn.
- Flashcard: một thẻ / viewport; tránh nhồi stats vào màn ôn chính.
- Teacher: màn bank + nút “Giao bộ từ” (song song với giao đề).

## 12. EXP (ngoài MVP)

Mặc định **không** cộng EXP khi review từ, để không đụng `exp_ledger` / `users.*_exp`.

Nếu product muốn sau này:

- Thêm nguồn `source = vocabulary_review` (bảng ledger mới hoặc mở rộng `exp_ledger` — cần design riêng).
- Không ghi EXP bằng cách sửa trực tiếp `users.flang_exp` không qua ledger.

Xem [exp.md](./exp.md).

## 13. Schema migration

- **Additive only:** `CREATE TABLE` cho các bảng mục 4.
- **Không** ALTER `questions`, `exams`, `exam_assignments`, `attempts`.
- Index gợi ý:
  - `student_vocabulary_cards (user_id, next_review_at)` — query due
  - `vocabulary_assignments (target_id)`, `(bank_id)`
  - Unique `(user_id, entry_id, assignment_id)` trên cards

Chi tiết cột khi implement: bổ sung vào [database-target.md](../database-target.md) cùng migration trong `supabase/migrations/`.

## 14. Acceptance Criteria

- Teacher tạo được vocabulary entry và bank.
- Teacher giao bank cho một student hoặc cả lớp (expand per student).
- Mỗi entry trong bank tạo đúng một card / student / assignment.
- Student vào mục cố định “Ôn từ vựng” và chỉ thấy thẻ due của mình.
- Chọn **thuộc** → `intervalStep` tăng, `nextReviewAt` = 0h của ngày hôm nay + mốc tương ứng (1→3→7→14→30).
- Chọn **thuộc** khi đang ở mốc 30 ngày → `status = mastered`, thẻ không còn xuất hiện trong queue due.
- Chọn **không thuộc** → `intervalStep = 0`, `nextReviewAt` = 0h ngày mai.
- Thẻ chưa đến hạn không xuất hiện trong danh sách due.
- Cancel assignment không xóa lịch sử review (nếu có event); card ngừng vào queue due.
- Không thay đổi schema / hành vi exam hiện có.
- Client không được tự set `intervalStep` / `nextReviewAt` tùy ý qua API.

## 15. Liên kết

- Phân phối đề (pattern giao lớp): [exam-distribution.md](./exam-distribution.md)
- Ngân hàng câu hỏi (pattern bank): [question-bank.md](./question-bank.md)
- Lớp học: [class-management.md](./class-management.md)
- Auth / role: [authentication-and-authorization.md](./authentication-and-authorization.md)
- Quy ước API: [_cross-cutting.md](./_cross-cutting.md)
- Schema đích: [database-target.md](../database-target.md)
