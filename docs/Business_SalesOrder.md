## Business — SalesOrder

```prisma
enum SalesOrderStatus {
  PENDING
  PAID
  CONFIRMED
  COMPLETED
  CANCELLED
  REFUNDED
}

model SalesOrder {
  id              String              @id @default(uuid()) @db.Uuid

  warehouseId     String              @db.Uuid
  warehouse       Warehouse           @relation(fields: [warehouseId], references: [id])

  customerId      String              @db.Uuid
  customer        User                @relation(fields: [customerId], references: [id])

  reservationId   String?             @db.Uuid
  reservation     Reservation?        @relation(fields: [reservationId], references: [id])

  status          SalesOrderStatus    @default(PENDING)

  totalAmount     Decimal             @db.Decimal(15, 2)

  paidAt          DateTime?
  confirmedAt     DateTime?
  completedAt     DateTime?
  cancelledAt     DateTime?
  refundedAt      DateTime?
  cancelReason    String?

  items           SalesOrderItem[]

  createdAt       DateTime            @default(now())
  updatedAt       DateTime            @updatedAt

  @@index([status])
  @@index([warehouseId])
  @@index([customerId])
  @@index([reservationId])
}

model SalesOrderItem {
  id            String        @id @default(uuid()) @db.Uuid

  salesOrderId  String        @db.Uuid
  salesOrder    SalesOrder    @relation(fields: [salesOrderId], references: [id])

  skuId         String        @db.Uuid
  sku           SKU           @relation(fields: [skuId], references: [id])

  quantity      Int

  unitPrice     Decimal       @db.Decimal(15, 2)

  createdAt     DateTime      @default(now())

  @@index([salesOrderId])
  @@index([skuId])
}
```

## Relationship

```text
Warehouse   (1) ─────────────< SalesOrder (N)
User        (1) ─────────────< SalesOrder (N)      // customer mua hàng
Reservation (1) ─────────────< SalesOrder (N)       // nullable, chỉ có nếu convert từ Reservation
SalesOrder  (1) ─────────────< SalesOrderItem (N)
SKU         (1) ─────────────< SalesOrderItem (N)
```

## Note — các điểm quan trọng

1. **Không có `expiresAt`** — khác với Reservation, Buy Now là quyết định mua ngay, không có khái niệm giữ chỗ tạm thời có hạn.

2. **`reservationId` nullable — phân biệt 2 luồng tạo SalesOrder, ảnh hưởng trực tiếp đến cách xử lý Inventory:**

   **Luồng A — Buy Now (reservationId = null):**

   ```
   BEGIN transaction
     SELECT * FROM Inventory WHERE ... FOR UPDATE
     → check available, nếu đủ → UPDATE reserved += qty, version += 1
     → INSERT SalesOrder + SalesOrderItem
     → INSERT InventoryMovement
   COMMIT
   ```

   **Luồng B — Convert từ Reservation đã CONFIRMED (reservationId = <id>):**

   ```
   BEGIN transaction
     → check Reservation.status = CONFIRMED
     → KHÔNG động vào Inventory.reserved (đã bị giữ từ lúc tạo Reservation rồi)
     → INSERT SalesOrder + SalesOrderItem (copy data từ ReservationItem)
   COMMIT
   ```

   ⚠️ Nếu convert mà chạy lại đúng luồng A (check available + tăng reserved) sẽ bị tăng `reserved` gấp đôi cho cùng 1 lượng hàng — bug nghiêm trọng, phải tách rõ 2 nhánh xử lý ở tầng service.

3. **`status` gồm cả `REFUNDED`** — thêm sẵn dù project hiện tại chưa làm module thanh toán, để sau này tích hợp payment không phải sửa schema.

4. **`totalAmount` lưu snapshot, không tính runtime** — khác với `quantityAvailable` ở Inventory (bắt buộc tính runtime để đảm bảo đúng đắn chống oversell), field này chỉ phục vụ hiển thị/báo cáo, không ảnh hưởng đến tính đúng đắn của concurrency. Lưu sẵn tránh phải JOIN + SUM mỗi lần hiển thị, và tổng tiền cuối có thể khác `SUM(quantity * unitPrice)` đơn giản nếu sau này có giảm giá/phí ship.

5. **`SalesOrderItem.unitPrice` là snapshot giá tại thời điểm mua** — cùng nguyên tắc với `ReservationItem.unitPrice`, không lấy giá SKU hiện tại.

6. **`Outbound` xử lý xuất hàng dựa trên `SalesOrderItem`** — không phân biệt SalesOrder đến từ luồng A hay B, đều trừ `onHand` và `reserved` như nhau khi xuất kho thật.

7. **Không có `shippingAddress`** — ngoài phạm vi project (tập trung concurrency/locking, không phải luồng giao vận).

8. **`paidAt`/`confirmedAt`/`completedAt`/`cancelledAt`/`refundedAt`/`cancelReason`** — cùng nguyên tắc với Reservation: track đầy đủ mọi bước chuyển status, kể cả bước không đụng Inventory (VD: `PENDING → PAID` chỉ là xác nhận thanh toán, không chạm Inventory). Không có `expiredAt` vì `SalesOrder` không có status `EXPIRED` (Buy Now không có TTL, khác Reservation).
