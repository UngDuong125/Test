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

- Teacher tạo / quản lý từ vựng và bộ từ (vocabulary bank). Có thể dán nhiều từ một lúc: mỗi dòng `từ | nghĩa`, `từ | /phiên âm/ | nghĩa`, `từ | nghĩa | ví dụ`, hoặc khối `TERM` / `READING` / `DEF` / `EXAMPLE` cách nhau bằng `===`. `term`, `definition` và `example` giữ `**đậm**`, `*nghiêng*`, `__gạch chân__`.
- Teacher giao bộ từ cho học sinh hoặc lớp (expand per student — giống [exam-distribution](./exam-distribution.md)).
- Student ôn flashcard: mặt trước → lật → chọn thuộc / không thuộc.
- Lịch ôn theo mốc 1 / 3 / 7 / 14 / 30 ngày; `next_review_at` quyết định từ nào “due”.
- Student chỉ thấy / ôn assignment thuộc quyền của mình.

Trang ôn có thêm chế độ **Nối từ** (tối đa 5 thẻ due, chấm trên trình duyệt). Chế độ này không ghi review, không đổi lịch SRS và không cộng EXP. Flashcard vẫn là cách ghi nhận thuộc / chưa thuộc. Chi tiết: [interactive-lessons.md](./interactive-lessons.md).

Ngoài phạm vi MVP (có thể mở rộng sau; hướng cải tiến đã ghi ở [mục 15](#15-cải-tiến-trải-nghiệm-ôn-tập) và [mục 16](#16-nhắc-ôn-và-theo-dõi-tiến-độ-ngoài-mvp-ban-đầu)):

- Thuật toán SM-2 / ease factor động (mục 15.1 chỉ thêm mức `hard`).
- Nghe – nói đầy đủ; gõ chính tả và trắc nghiệm (mục 15.2).
- Cộng EXP khi ôn từ (xem mục 12).
- Import CSV / từ điển ngoài (dán text trong trang bộ từ đã có).
- Nhắc push; email nhắc (mục 16.1).

## 3. Tại sao module riêng?

Không tái sử dụng `questions` / `exams` / `exam_assignments` / `attempts` vì:

| Exam flow | Vocabulary SRS |
| :--- | :--- |
| Một lần làm đề, chấm điểm | Nhiều lần ôn từng thẻ theo lịch |
| `attempt_limit`, duration, deadline nộp | `next_review_at`, interval step |
| Snapshot đề + grading | Trạng thái thẻ per student |
| `exam_questions` = câu hỏi trong đề | Word bank = mục từ vựng |

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

Tập từ để giao bài cho học sinh.

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

| `intervalStep` | `INTERVAL_DAYS[step]` (dùng sau FAIL hoặc làm chỉ số bước) |
| :---: | :--- |
| 0 | 1 ngày |
| 1 | 3 ngày |
| 2 | 7 ngày |
| 3 | 14 ngày |
| 4 | 30 ngày |

Hằng số backend: `INTERVAL_DAYS = [1, 3, 7, 14, 30]`. Khi **PASS**, `nextReviewAt` lấy `INTERVAL_DAYS[nextStep]` (step 0 → pass → step 1 → +3 ngày), không phải +1 ngày.

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
| `teacher` | CRUD bank/entry mình sở hữu | Giao cho HS / lớp mình quản lý | Xem danh sách assignment đã giao (`GET /api/students/:id/vocabulary-assignments`); thống kê due/pass rate chi tiết — phase sau |
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

POST   /api/vocabulary-banks/:id/items      # { entryIds: string[] }
DELETE /api/vocabulary-banks/:id/items/:entryId
```

### Assignment

```text
GET    /api/vocabulary-assignments
POST   /api/vocabulary-assignments
GET    /api/vocabulary-assignments/:id
POST   /api/vocabulary-assignments/:id/cancel
# Không có PATCH assignment — hủy rồi giao lại nếu cần sửa

POST   /api/vocabulary-banks/:id/assign     # bulk user | class
GET    /api/students/me/vocabulary-assignments
GET    /api/students/:id/vocabulary-assignments
```

### Review (student)

```text
GET    /api/students/me/vocabulary/due      # trang thẻ due (+ entry); dueCount là tổng
POST   /api/vocabulary-cards/:id/review     # { result: "pass" | "fail" }
GET    /api/students/me/vocabulary/stats    # không chặn thẻ đầu: due count, mastered, …
```

Hợp đồng tốc độ: [student-response.md](./student-response.md). Trang đầu tối đa 30 thẻ, `card` và `entry` không query từng thẻ. Bấm thuộc hoặc chưa thuộc dùng response của `POST .../review` để chuyển thẻ, không gọi lại `/due`.

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
Theo dõi tiến độ (số thẻ due / pass rate — mục 16.2)
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
- Flashcard: một thẻ / viewport. Thẻ đầu vẽ từ `GET .../vocabulary/due`. Stats tải sau và không đứng trước thẻ đó.
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
- Student vào mục cố định “Ôn từ vựng” và chỉ thấy thẻ due của mình. Thẻ đầu hiện từ một `GET .../due` (tối đa 30 thẻ, có `dueCount`); bấm thuộc hoặc chưa thuộc không gọi lại cả danh sách.
- Chọn **thuộc** → `intervalStep` tăng lên `nextStep`, `nextReviewAt` = 0h hôm nay + `INTERVAL_DAYS[nextStep]` (PASS lần đầu từ step 0 → +3 ngày; rồi 7 → 14 → 30; mốc 1 ngày chủ yếu dùng sau FAIL).
- Chọn **thuộc** khi đang ở mốc 30 ngày → `status = mastered`, thẻ không còn xuất hiện trong queue due.
- Chọn **không thuộc** → `intervalStep = 0`, `nextReviewAt` = 0h ngày mai.
- Thẻ chưa đến hạn không xuất hiện trong danh sách due.
- Cancel assignment không xóa lịch sử review (nếu có event); card ngừng vào queue due.
- Không thay đổi schema / hành vi exam hiện có.
- Client không được tự set `intervalStep` / `nextReviewAt` tùy ý qua API.

## 15. Cải tiến trải nghiệm ôn tập

Các mục dưới đây mở rộng MVP; ghi rõ để tránh mâu thuẫn với mục 2 ("ngoài phạm vi"). Mục nào làm sau thì để cờ cấu hình tắt.

### 15.1. Mức độ nhớ (4 nút thay cho 2)

Đã cài: flashcard có ba nút **Không thuộc / Khó nhớ / Thuộc** (phím ← ↓ →). **Khó nhớ**: kết quả `hard` giữ `intervalStep` hiện tại (không tăng, không reset), `nextReviewAt = startOfDay(today + INTERVAL_DAYS[intervalStep])`. `result` của `POST .../review` mở rộng thành `pass | fail | hard`; backend vẫn là nơi duy nhất tính lịch.

### 15.2. Hình thức ôn

- **Trắc nghiệm nghĩa (đã cài):** chọn nghĩa đúng trong tối đa 4 lựa chọn; phương án nhiễu lấy từ các thẻ due khác đang có trên trang (không gọi thêm API), bỏ nghĩa trùng. Ít hơn 2 nghĩa khác nhau thì đề nghị dùng Flashcard/Gõ từ. Kết quả ghi qua `POST .../review` như flashcard.
- **Gõ chính tả (đã cài):** nhập `term` từ `definition`; so khớp bỏ định dạng `**`/`*`/`__`, dấu câu, khoảng trắng thừa, không phân biệt hoa thường, giữ dấu tiếng Việt; `term` dạng `colour / color` chấp nhận từng biến thể. Ghi review `pass`/`fail`.
- **Nghe:** nếu entry có `mediaId` audio thì có nút phát; chế độ nghe-chọn từ.
- **Nối từ** vẫn không ghi review (mục 2). Tùy chọn: nối đúng cả 5 thẻ thì gợi ý "Ôn tiếp bằng flashcard", không tự đổi lịch.

### 15.3. Động lực

- **Streak (đã cài):** số ngày liên tiếp có ít nhất một review, tính theo `VOCABULARY_TIME_ZONE`; chuỗi còn sống tới hết ngày hôm nay dù chưa ôn. Lưu ở bảng `student_review_days (user_id, day, reviews)` (backfill từ `vocabulary_review_events`); `GET .../vocabulary/stats` trả thêm `streak`, `reviewedToday`.
- **Mục tiêu ngày (đã cài):** mặc định 10 thẻ, học sinh chỉnh được (lưu trên trình duyệt), thanh tiến độ trên trang ôn. `hard` không tăng `passCount`/`failCount`.
- **EXP cho ôn từ:** vẫn mặc định tắt (mục 12). Nếu bật thì dùng nguồn riêng, có trần mỗi ngày để không lấn át EXP bài làm.

## 16. Nhắc ôn và theo dõi tiến độ (ngoài MVP ban đầu)

### 16.1. Nhắc ôn

- Badge "N thẻ đến hạn" trên mục "Ôn từ vựng" (nav, dashboard) — làm trước, không cần hạ tầng mới.
- Email nhắc tùy chọn: một email tóm tắt mỗi ngày khi `dueCount > 0` và học sinh chưa ôn hôm nay; học sinh tắt được. Học sinh không có email thì bỏ qua. Gửi theo lịch cronjob, không trong request của học sinh.

### 16.2. Tiến độ cho teacher

```text
GET /api/vocabulary-banks/:id/progress?classId=   # đã cài
```

Đã cài trong panel **Tiến độ ôn của học sinh** ở `/vocabulary` khi chọn một bộ từ. Thẻ của assignment đã hủy không tính; thẻ của assignment hết hạn/chưa mở không tính là "đến hạn". "Từ khó" cần ít nhất 3 lượt ôn. Chưa có streak (cần lưu ngày ôn).

Mỗi học sinh: số thẻ `learning` / `mastered` / `suspended`, số thẻ đang due, `passCount`/`failCount`, `lastReviewedAt`, streak. Tổng hợp theo lớp: tỷ lệ học sinh đã ôn trong 7 ngày, danh sách học sinh **chưa ôn quá 3 ngày**, và các từ có tỷ lệ fail cao nhất (từ khó). Quyền: owner bank / giáo viên của lớp / admin; không lộ dữ liệu học sinh ngoài phạm vi.

### 16.3. Tiêu chí xong

- Teacher thấy danh sách học sinh lâu chưa ôn và các từ hay sai.
- Badge số thẻ đến hạn khớp `dueCount` của `/due`.
- Chế độ `hard` không tăng và không reset `intervalStep`.
- Gõ chính tả và trắc nghiệm đều đi qua `POST /api/vocabulary-cards/:id/review`, client không tự đặt lịch.

## 17. Liên kết

- Phân phối đề (pattern giao lớp): [exam-distribution.md](./exam-distribution.md)
- Lớp học: [class-management.md](./class-management.md)
- Auth / role: [authentication-and-authorization.md](./authentication-and-authorization.md)
- Quy ước API: [_cross-cutting.md](./_cross-cutting.md)
- Tốc độ màn ôn: [student-response.md](./student-response.md)
- Schema đích: [database-target.md](../database-target.md)
