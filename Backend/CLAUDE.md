# Quy tắc làm việc cho Claude Code trong dự án này

## 1. Luôn hỏi đầy đủ thông tin trước khi làm

Trước khi bắt đầu bất kỳ task nào, phải hỏi rõ các thông tin/quyết định nghiệp vụ còn thiếu — **không tự suy đoán hoặc tự chọn thay** khi có nhiều hơn 1 cách làm hợp lý. Nếu có 2 hướng thiết kế khác nhau, trình bày rõ **trade-off của từng hướng** rồi hỏi, không tự quyết định hộ.

## 2. Luôn liệt kê danh sách bước (task list) trước khi code

Với mỗi task, bước đầu tiên là liệt kê ra **các bước cụ thể** sẽ làm (dạng danh sách đánh số), đưa cho tôi đọc và xác nhận (chốt) trước. **Không viết bất kỳ dòng code nào cho tới khi tôi xác nhận danh sách đó.**

Nếu task nhỏ, đơn giản, rõ ràng (VD: sửa 1 dòng lỗi typo) thì không cần list — nhưng nếu không chắc là task nhỏ hay lớn, mặc định coi là task lớn và list ra trước.

## 3. Làm từng bước, không làm dồn 1 lần

Sau khi danh sách bước được xác nhận, thực hiện **từng bước một**. Sau mỗi bước quan trọng (đặc biệt là bước tạo/sửa nhiều file, hoặc bước liên quan tới logic concurrency/transaction), dừng lại báo cáo đã làm gì, chờ xác nhận rồi mới qua bước tiếp theo — không tự động chạy hết toàn bộ danh sách bước liên tục không dừng.

## 4. Không tự tạo/ghi đè file khi chưa được phép

Không tự ý tạo file mới hoặc sửa/ghi đè file đã có sẵn nếu chưa được xác nhận rõ ràng trong bước đang làm. Nếu cần tạo file ngoài phạm vi đã chốt (VD: phát hiện cần thêm 1 file util mới giữa chừng), phải dừng lại hỏi trước.

## 5. Tuân thủ convention đã có của dự án

- Cấu trúc module theo feature-based: mỗi module trong `src/modules/<name>/` gồm `.controller.ts`, `.service.ts`, `.repository`, `.routes.ts`, `.schema.ts`
- Dùng Zod cho validate request kèm gắn type dùng infer
- Response format chuẩn (JSend-inspired):
  Thành công: { success: true, data }, có thêm meta nếu là list có phân trang ({ page, limit, total })
  Lỗi: { success: false, error: { code, message, details } } — code là string định danh (VD: OUT_OF_STOCK, VERSION_CONFLICT), không phải số; details chứa thêm thông tin lỗi (VD: field nào validate sai), null nếu không có
  HTTP status code vẫn set đúng chuẩn REST song song (res.status(409).json(...)), success trong body không thay thế status code mà chỉ tiện cho frontend check nhanh
- Commit message theo Conventional Commits (`feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `style`)
- Import cần `.js` ở cuối (dự án dùng `moduleResolution: NodeNext` — xác nhận lại theo `tsconfig.json` hiện tại trước khi code, vì có thể đã đổi)
- Mọi thao tác thay đổi `Inventory` (onHand/reserved) đều phải nằm trong 1 Prisma transaction, kèm ghi `InventoryMovement` trong cùng transaction đó — không tách riêng

## 6. Tóm tắt sau khi xong 1 phần

Sau khi hoàn thành 1 bước hoặc 1 module, tóm tắt ngắn gọn đã làm gì, file nào đã tạo/sửa, trước khi hỏi có tiếp tục bước sau không.

---

## Bối cảnh dự án (tham khảo nhanh)

- **Dự án**: Hệ thống quản lý kho hàng đa chi nhánh (Inventory & Warehouse Management), trọng tâm giải quyết race condition/overselling/over-reservation
- **Stack**: TypeScript, Express, Prisma v7 (driver adapter `@prisma/adapter-pg`), PostgreSQL, Redis, BullMQ, Zod, JWT
- **Package manager**: pnpm, monorepo (`Backend/`, `Frontend/Client/`, `Frontend/Management/`)
- **Concurrency strategy**: Pessimistic Locking (`SELECT ... FOR UPDATE`) cho Reservation/SalesOrder/Inbound/Outbound/Transfer; Optimistic Locking (version field) cho InventoryAdjustment
- **Schema đầy đủ**: `Backend/prisma/schema.prisma`
