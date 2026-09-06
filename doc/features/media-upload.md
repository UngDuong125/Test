# Feature: Media Upload

## 1. Mục tiêu

Cho phép teacher/admin upload ảnh (và media được hỗ trợ) để gắn vào rich content của `Question` (`type: image`, `mediaId`). Upload ký từ backend; frontend không giữ secret Cloudinary.

## 2. Actor

| Role | Quyền |
| :--- | :--- |
| `teacher`, `admin` | Upload media gắn câu hỏi/đề trong phạm vi |
| `student` | Không upload; chỉ nhận URL đã có trong snapshot attempt |

## 3. Luồng

```text
Client chọn file
    ↓
POST /api/upload (multipart, cookie session)
    ↓
Backend kiểm tra role, MIME, kích thước
    ↓
Upload Cloudinary (service role / signed)
    ↓
Lưu metadata media (optional table) + trả mediaId + url
    ↓
Client gắn mediaId vào Question.content block
```

## 4. Model

### Content block

```json
{
  "type": "image",
  "mediaId": "media_001",
  "alt": "Hình tam giác ABC"
}
```

### Media record (schema đích gợi ý)

| Cột | Kiểu | Mô tả |
| :--- | :--- | :--- |
| `id` | uuid PK | = `mediaId` |
| `url` | text | HTTPS Cloudinary |
| `public_id` | text | Cloudinary public id |
| `mime_type` | text | `image/jpeg`, `image/png`, `image/webp` |
| `byte_size` | int | |
| `uploaded_by` | uuid FK → users | |
| `created_at` | timestamptz | |

Có thể lưu tối giản chỉ URL trên question nếu chưa có bảng `media`; MVP khuyến nghị bảng `media` để validate “image/media phải tồn tại” khi publish câu hỏi.

## 5. Ràng buộc

| Rule | Giá trị MVP |
| :--- | :--- |
| MIME | `image/jpeg`, `image/png`, `image/webp` |
| Max size | 2 MB / file (khớp body limit API hoặc thấp hơn) |
| Max dimension | Resize phía Cloudinary (ví dụ max width 1600) |
| Rate limit | Theo user (ví dụ 30 upload / 15 phút) → `429` |
| Virus/scan | Tùy infra; tối thiểu reject non-image |

- Không trả Cloudinary API secret về client.
- URL phải HTTPS.
- Xóa question không bắt buộc xóa media ngay (GC / soft orphan sau).

## 6. API

| Method | Endpoint | Body | Kết quả |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/upload` | multipart field `file` | `{ mediaId, url, mimeType, byteSize }` |
| `GET` | `/api/media/:id` | — | Metadata (auth); optional |
| `DELETE` | `/api/media/:id` | — | Owner/admin; optional MVP |

### Response mẫu

```json
{
  "mediaId": "media_001",
  "url": "https://res.cloudinary.com/.../image.jpg",
  "mimeType": "image/jpeg",
  "byteSize": 184320
}
```

Biến môi trường: `CLOUDINARY_*` (chỉ backend). Xem [overview.md](../overview.md) tech stack.

## 7. Validation khi publish question

- Mọi block `type=image` phải có `mediaId` tồn tại.
- LaTeX block validate parse cơ bản (không thuộc upload nhưng cùng bước publish).

## 8. Acceptance Criteria

- Teacher upload ảnh và gắn vào câu hỏi; preview hiển thị được.
- Student làm bài thấy ảnh từ snapshot, không gọi upload.
- File sai MIME / quá lớn → `422`; chưa login → `401`; student upload → `403`.
- Secret Cloudinary không lộ ra frontend.

## 9. File liên quan

| Layer | Path |
| :--- | :--- |
| API | `backend/src/routes/upload.routes.ts`, `services/upload.service.ts` |
| Question | [question-management.md](./question-management.md) |
| Schema | `media` trong [database-target.md](../database-target.md) |
| Quy ước lỗi | [_cross-cutting.md](./_cross-cutting.md) |
