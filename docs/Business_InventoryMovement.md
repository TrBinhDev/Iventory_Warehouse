## Audit — InventoryMovement

```prisma
enum MovementType {
  RESERVE
  RELEASE
  INBOUND
  OUTBOUND
  TRANSFER_OUT
  TRANSFER_IN
  ADJUSTMENT
}

enum ReferenceType {
  RESERVATION
  SALES_ORDER
  INBOUND
  OUTBOUND
  TRANSFER
  INVENTORY_ADJUSTMENT
}

model InventoryMovement {
  id              String          @id @default(uuid()) @db.Uuid

  inventoryId     String          @db.Uuid
  inventory       Inventory       @relation(fields: [inventoryId], references: [id])

  createdByUserId String?         @db.Uuid
  createdBy       User?           @relation(fields: [createdByUserId], references: [id])

  movementType    MovementType

  referenceType   ReferenceType

  referenceId     String          @db.Uuid

  onHandBefore    Int
  onHandAfter     Int

  reservedBefore  Int
  reservedAfter   Int

  note            String?

  createdAt       DateTime        @default(now())

  @@index([inventoryId, createdAt])
  @@index([referenceType, referenceId])
}
```

## Relationship

```text
Inventory (1) ─────────────< InventoryMovement (N)
User      (1) ─────────────< InventoryMovement (N)   // createdBy, nullable
```

## Note — các điểm quan trọng

1. **`referenceId` KHÔNG phải FK thật** — vì đây là polymorphic reference (có thể trỏ tới `Reservation`, `SalesOrder`, `Inbound`, `Outbound`, `Transfer`, hoặc `InventoryAdjustment` tùy `referenceType`). Prisma không hỗ trợ polymorphic relation natively (không như 1 FK trỏ cố định 1 bảng), nên `referenceId` chỉ là `String @db.Uuid` thường, không có `@relation`. Muốn lấy chi tiết phiếu gốc, code phải tự switch theo `referenceType` rồi query đúng bảng tương ứng ở tầng service.

2. **Lưu cả `onHand` LẪN `reserved`, trước và sau (4 field), không chỉ delta 1 số** — vì các `movementType` khác nhau động vào field khác nhau:
   - `RESERVE`/`RELEASE` (từ Reservation/SalesOrder tạo/hủy): chỉ đổi `reserved`, `onHand` before/after giống nhau
   - `INBOUND`: chỉ đổi `onHand`, `reserved` before/after giống nhau
   - `OUTBOUND`: đổi CẢ 2 cùng lúc (trừ `onHand` và `reserved`)
   - `TRANSFER_OUT`: chỉ đổi `onHand` kho nguồn (giảm)
   - `TRANSFER_IN`: chỉ đổi `onHand` kho đích (tăng)
   - `ADJUSTMENT`: chỉ đổi `onHand` (set trực tiếp theo `quantityAfter` đã kiểm kê)

   Lưu đủ cả 4 giá trị giúp audit log tự đủ thông tin để trace lại chính xác trạng thái tại từng thời điểm, không cần suy luận ngược từ delta.

3. **Bảng này KHÔNG có `updatedAt`** — đúng bản chất audit log là **immutable** (chỉ INSERT, không bao giờ UPDATE/DELETE một khi đã ghi).

4. **1 row = 1 lần thay đổi trên 1 `Inventory` (tức 1 cặp warehouse+SKU) trong 1 giao dịch** — nếu 1 `Reservation` đặt 2 SKU cùng lúc, sẽ tạo ra **2 row** `InventoryMovement` riêng biệt (đã note ở các module trước), không gộp chung 1 row cho cả phiếu.

5. **Ghi log LUÔN nằm trong CÙNG transaction** với chính thao tác thay đổi `Inventory` (đã note xuyên suốt các module trước: Reservation, Inbound, Outbound, Transfer, Adjustment) — không ghi log sau khi COMMIT, để đảm bảo log và số liệu thực tế không bao giờ lệch nhau nếu transaction fail giữa chừng.

6. **`@@index([referenceType, referenceId])`** — phục vụ query kiểu "xem toàn bộ biến động Inventory gây ra bởi đơn hàng X" (ngược từ business object → movement), còn `@@index([inventoryId, createdAt])` phục vụ query "lịch sử biến động của 1 SKU tại 1 kho theo thời gian" (thuận từ Inventory → log).

7. **`createdByUserId` nullable** — hầu hết movement gắn với 1 user cụ thể (người tạo Inbound/Outbound/Transfer/Adjustment, hoặc customer tạo Reservation/SalesOrder), nhưng một số movement do **hệ thống tự động** tạo ra, không có user nào thao tác trực tiếp — điển hình là BullMQ job tự nhả `reserved` khi Reservation hết hạn (`movementType = RELEASE`). Những trường hợp đó `createdByUserId = null`.
