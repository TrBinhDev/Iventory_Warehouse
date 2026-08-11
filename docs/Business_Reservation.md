## Business — Reservation

```prisma
enum ReservationStatus {
  PENDING
  CONFIRMED
  CANCELLED
  EXPIRED
}

model Reservation {
  id            String              @id @default(uuid()) @db.Uuid

  code          String              @unique @db.VarChar(30)

  warehouseId   String              @db.Uuid
  warehouse     Warehouse           @relation(fields: [warehouseId], references: [id])

  customerId    String              @db.Uuid
  customer      User                @relation(fields: [customerId], references: [id])

  status        ReservationStatus   @default(PENDING)

  expiresAt     DateTime

  confirmedAt   DateTime?
  cancelledAt   DateTime?
  expiredAt     DateTime?
  cancelReason  String?

  items         ReservationItem[]

  createdAt     DateTime            @default(now())
  updatedAt     DateTime            @updatedAt

  @@index([status])
  @@index([expiresAt])
  @@index([warehouseId])
  @@index([customerId])
}

model ReservationItem {
  id              String        @id @default(uuid()) @db.Uuid

  reservationId   String        @db.Uuid
  reservation     Reservation   @relation(fields: [reservationId], references: [id])

  skuId           String        @db.Uuid
  sku             SKU           @relation(fields: [skuId], references: [id])

  quantity        Int

  unitPrice       Decimal       @db.Decimal(15, 2)

  createdAt       DateTime      @default(now())

  @@index([reservationId])
  @@index([skuId])
}
```

## Relationship

```text
Warehouse   (1) ─────────────< Reservation (N)
User        (1) ─────────────< Reservation (N)     // customer đặt trước
Reservation (1) ─────────────< ReservationItem (N)
SKU         (1) ─────────────< ReservationItem (N)
```

## Note — các điểm quan trọng

1. **`warehouseId` đặt ở header, không ở item** — 1 Reservation chỉ giữ chỗ từ 1 kho duy nhất. Nếu kho đó không đủ hàng thì không tạo được, không tự động lấy bù từ kho khác (bù hàng là nghiệp vụ Transfer/Inbound riêng, xử lý sau).

2. **`customerId`** — gắn với người đặt, dùng `User` đã có sẵn (role `CUSTOMER`).

3. **`idempotencyKey` KHÔNG lưu trong bảng này** — xử lý ở Redis (`SETNX` + TTL), check _ngoài_ transaction Postgres trước khi chạm DB. Chỉ cache response **thành công**; fail do hết hàng (business logic, không phải lỗi hệ thống) thì không cache dài hạn, để request sau (dù cùng key) được thử lại bình thường.

4. **`expiresAt` lưu DB, không lưu Redis** — vì việc nhả `reserved` phải atomic cùng transaction Postgres với update `Inventory`. Cơ chế trigger: BullMQ delayed job (schedule đúng lúc tạo Reservation, chạy 1 lần đúng thời điểm hết hạn) làm chính, cộng cron dự phòng tần suất thấp (15-30 phút/lần) quét row `status=PENDING AND expiresAt < NOW()` bị job chính bỏ sót (VD: Redis restart mất job).

5. **`ReservationItem.unitPrice` là snapshot giá tại thời điểm đặt** — không lấy `SKU.price` hiện tại lúc tính tiền sau này.

6. **Luồng tạo Reservation dùng Pessimistic Locking + Transaction:**

```
BEGIN transaction
  SELECT * FROM Inventory WHERE warehouseId=X AND skuId IN (...)
    ORDER BY skuId ASC   -- sort cố định để tránh deadlock giữa các transaction
    FOR UPDATE
  → tính available = onHand - reserved cho từng SKU
  → nếu bất kỳ SKU nào available < qty yêu cầu → throw, ROLLBACK toàn bộ
  → UPDATE Inventory SET reserved += qty, version += 1
  → INSERT Reservation + ReservationItem
  → INSERT InventoryMovement (audit log)
COMMIT → nhả lock
→ SAU KHI commit thành công mới schedule BullMQ delayed job (ngoài transaction DB)
```

7. **Fail do hết hàng giữa chừng → toàn bộ transaction rollback**, không tạo Reservation/ReservationItem nào, `Inventory` không đổi gì. API trả `409 Conflict`.

8. **`ReservationItem` không có `updatedAt`** — snapshot bất biến, không sửa sau khi tạo. Muốn đổi số lượng thì hủy Reservation cũ, tạo mới.

9. **`confirmedAt`/`cancelledAt`/`expiredAt`/`cancelReason`** — cần thiết vì `InventoryMovement` chỉ ghi log ở bước có chạm Inventory; các bước chuyển status không đụng Inventory (VD: `PENDING → CONFIRMED`) sẽ hoàn toàn mất dấu vết nếu thiếu field này. `expiredAt` tách riêng khỏi `cancelledAt` vì khác nguồn gốc: hệ thống tự động (BullMQ job/cron) vs người dùng chủ động hủy — quan trọng khi audit/debug.

10. **`code`** — mã phiếu dễ đọc dùng để hiển thị cho khách/nhân viên (VD `RES-20260811-0001`), tách biệt với `id` (UUID dùng nội bộ cho FK). Sinh ở tầng service lúc tạo, `@unique` để DB chặn trùng nếu logic sinh code có bug; cách sinh cụ thể (sequence/timestamp-based...) quyết định lúc code module.
