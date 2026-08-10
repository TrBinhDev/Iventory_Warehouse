## Business — Outbound

```prisma
enum OutboundStatus {
  DRAFT
  CONFIRMED
  SHIPPED
  CANCELLED
}

enum OutboundReason {
  SALES_ORDER
  RETURN_TO_SUPPLIER
  DAMAGED
  OTHER
}

model Outbound {
  id              String          @id @default(uuid()) @db.Uuid

  warehouseId     String          @db.Uuid
  warehouse       Warehouse       @relation(fields: [warehouseId], references: [id])

  reason          OutboundReason  @default(SALES_ORDER)

  salesOrderId    String?         @db.Uuid
  salesOrder      SalesOrder?     @relation(fields: [salesOrderId], references: [id])

  supplierId      String?         @db.Uuid
  supplier        Supplier?       @relation(fields: [supplierId], references: [id])

  createdByUserId String          @db.Uuid
  createdBy       User            @relation(fields: [createdByUserId], references: [id])

  note            String?

  status          OutboundStatus  @default(DRAFT)

  shippedAt       DateTime?

  items           OutboundItem[]

  createdAt       DateTime        @default(now())
  updatedAt       DateTime        @updatedAt

  @@index([status])
  @@index([warehouseId])
  @@index([salesOrderId])
  @@index([supplierId])
}

model OutboundItem {
  id            String        @id @default(uuid()) @db.Uuid

  outboundId    String        @db.Uuid
  outbound      Outbound      @relation(fields: [outboundId], references: [id])

  skuId         String        @db.Uuid
  sku           SKU           @relation(fields: [skuId], references: [id])

  quantity      Int

  createdAt     DateTime      @default(now())

  @@index([outboundId])
  @@index([skuId])
}
```

## Relationship

```text
Warehouse  (1) ─────────────< Outbound (N)
SalesOrder (1) ─────────────< Outbound (N)      // nullable, chỉ có khi reason = SALES_ORDER
Supplier   (1) ─────────────< Outbound (N)      // nullable, chỉ có khi reason = RETURN_TO_SUPPLIER
User       (1) ─────────────< Outbound (N)      // createdBy - nhân viên tạo phiếu
Outbound   (1) ─────────────< OutboundItem (N)
SKU        (1) ─────────────< OutboundItem (N)
```

## Note — các điểm quan trọng

1. **`reason` phân biệt 4 nguồn xuất kho, kéo theo `salesOrderId`/`supplierId` nullable và bắt buộc theo điều kiện (validate ở service layer):**
   - `reason = SALES_ORDER` (mặc định) → `salesOrderId` bắt buộc, `supplierId` phải `null`
   - `reason = RETURN_TO_SUPPLIER` → `supplierId` bắt buộc (trả hàng lỗi/hỏng về đúng NCC), `salesOrderId` phải `null`
   - `reason = DAMAGED` → cả 2 đều `null`, dùng `note` ghi lý do cụ thể (VD: "vỡ do va đập lúc kiểm kê")
   - `reason = OTHER` → cả 2 đều `null`, bắt buộc có `note`

2. **`OutboundItem` KHÔNG có `unitCost`/`unitPrice`** — khác với `InboundItem`/`ReservationItem`/`SalesOrderItem`. Vì giá trị tiền đã được chốt từ `SalesOrderItem.unitPrice` (nếu xuất do bán hàng) hoặc không cần thiết (DAMAGED/OTHER không phát sinh giao dịch tiền). Nếu cần biết giá trị hàng xuất, join qua `SalesOrderItem` thông qua `salesOrderId`.

3. **Status flow — chỉ chạm vào Inventory ở bước `SHIPPED`, và là bước DUY NHẤT trừ CẢ `onHand` LẪN `reserved` cùng lúc:**
   - `DRAFT`: staff tạo phiếu, chưa trừ gì
   - `CONFIRMED`: đã duyệt, hàng chưa rời kho — vẫn chưa trừ gì
   - `SHIPPED`: hàng thực sự rời kho — **lúc này mới** chạy transaction trừ `onHand` và `reserved`
   - `CANCELLED`: chỉ cho phép hủy khi đang `DRAFT` hoặc `CONFIRMED`, cùng nguyên tắc với `Inbound.CANCELLED`

4. **Luồng xử lý lúc chuyển status → `SHIPPED` (bước duy nhất chạm Inventory):**

   ```
   BEGIN transaction
     SELECT * FROM Inventory WHERE warehouseId=X AND skuId IN (...)
       ORDER BY skuId ASC
       FOR UPDATE
     → với mỗi SKU trong OutboundItem:
         check onHand >= quantity (lưới an toàn, dù lý thuyết đã đủ vì reserved luôn <= onHand)
         UPDATE onHand -= quantity, reserved -= quantity, version += 1
     → UPDATE Outbound.status = SHIPPED, shippedAt = now()
     → nếu reason = SALES_ORDER → UPDATE SalesOrder.status = COMPLETED (nếu đã xuất đủ toàn bộ item của đơn)
     → INSERT InventoryMovement (audit log, movementType = OUTBOUND)
   COMMIT
   ```

5. **Điểm khác biệt quan trọng với Inbound: Outbound LUÔN yêu cầu row Inventory đã tồn tại từ trước** — không upsert. Nếu không có row (SKU chưa từng nhập vào kho này) thì không thể xuất, throw lỗi ngay từ bước check, không phải lỗi logic mà là dữ liệu không hợp lệ (không thể xuất hàng chưa từng nhập).

6. **`reserved -= quantity` chỉ trừ đúng phần liên quan đến `salesOrderId` của chính Outbound này** — không phải trừ/xóa toàn bộ `reserved` của SKU đó (SKU có thể đang bị giữ chỗ bởi nhiều Reservation/SalesOrder khác cùng lúc, không liên quan đến phiếu Outbound đang xử lý). Số lượng trừ lấy từ `OutboundItem.quantity`, khớp với số đã được cộng vào `reserved` lúc tạo `SalesOrder`/`Reservation` tương ứng.

7. **`createdByUserId`** — cùng nguyên tắc với `Inbound`, track nhân viên tạo phiếu, validate `createdBy.warehouseId === Outbound.warehouseId` ở service layer.
