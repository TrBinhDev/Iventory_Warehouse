## Business — Inbound

```prisma
enum InboundStatus {
  DRAFT
  CONFIRMED
  RECEIVED
  CANCELLED
}

enum InboundReason {
  FROM_SUPPLIER
  CUSTOMER_RETURN
}

model Inbound {
  id              String          @id @default(uuid()) @db.Uuid

  warehouseId     String          @db.Uuid
  warehouse       Warehouse       @relation(fields: [warehouseId], references: [id])

  reason          InboundReason   @default(FROM_SUPPLIER)

  supplierId      String?         @db.Uuid
  supplier        Supplier?       @relation(fields: [supplierId], references: [id])

  salesOrderId    String?         @db.Uuid
  salesOrder      SalesOrder?     @relation(fields: [salesOrderId], references: [id])

  createdByUserId String          @db.Uuid
  createdBy       User            @relation(fields: [createdByUserId], references: [id])

  status          InboundStatus   @default(DRAFT)

  confirmedAt     DateTime?
  receivedAt      DateTime?
  cancelledAt     DateTime?
  cancelReason    String?

  items           InboundItem[]

  createdAt       DateTime        @default(now())
  updatedAt       DateTime        @updatedAt

  @@index([status])
  @@index([warehouseId])
  @@index([supplierId])
  @@index([salesOrderId])
}

model InboundItem {
  id            String        @id @default(uuid()) @db.Uuid

  inboundId     String        @db.Uuid
  inbound       Inbound       @relation(fields: [inboundId], references: [id])

  skuId         String        @db.Uuid
  sku           SKU           @relation(fields: [skuId], references: [id])

  quantity      Int

  unitCost      Decimal       @db.Decimal(15, 2)

  createdAt     DateTime      @default(now())

  @@index([inboundId])
  @@index([skuId])
}
```

## Relationship

```text
Warehouse  (1) ─────────────< Inbound (N)
Supplier   (1) ─────────────< Inbound (N)      // nullable, chỉ có khi reason = FROM_SUPPLIER
SalesOrder (1) ─────────────< Inbound (N)      // nullable, chỉ có khi reason = CUSTOMER_RETURN
User       (1) ─────────────< Inbound (N)      // createdBy - nhân viên tạo phiếu
Inbound    (1) ─────────────< InboundItem (N)
SKU        (1) ─────────────< InboundItem (N)
```

## Note — các điểm quan trọng

1. **Status flow — chỉ chạm vào `Inventory.onHand` ở bước `RECEIVED`:**
   - `DRAFT`: staff nhập liệu, chưa cộng `onHand`
   - `CONFIRMED`: đã duyệt, nhưng hàng vật lý chưa chắc về tới kho — vẫn chưa cộng `onHand`
   - `RECEIVED`: hàng thực tế đã nhận vào kho — **lúc này mới** chạy transaction cộng `onHand`
   - `CANCELLED`: hủy phiếu — **chỉ cho phép hủy khi đang `DRAFT` hoặc `CONFIRMED`**, validate ở service layer. Không cho hủy khi đã `RECEIVED` (vì lúc đó `onHand` đã cộng rồi, hủy sẽ cần luồng rollback riêng phức tạp hơn, ngoài scope hiện tại).

2. **`createdByUserId`** — track nhân viên tạo phiếu, dùng cho audit. Ở tầng service nên validate `createdBy.warehouseId === Inbound.warehouseId` (nhân viên chỉ tạo phiếu nhập cho đúng kho mình thuộc, trừ Admin).

2b. **`reason` phân biệt 2 nguồn nhập kho, kéo theo `supplierId`/`salesOrderId` đều nullable và bắt buộc theo điều kiện (validate ở service layer, không phải DB constraint):**

- `reason = FROM_SUPPLIER` (mặc định) → `supplierId` bắt buộc, `salesOrderId` phải `null`
- `reason = CUSTOMER_RETURN` → `salesOrderId` bắt buộc (biết trả hàng thuộc đơn nào), `supplierId` phải `null`

Về mặt Inventory, cả 2 nhánh xử lý **giống hệt nhau** ở bước `RECEIVED` (cùng cộng `onHand`, cùng cần `FOR UPDATE` + upsert) — `reason` chỉ phục vụ mục đích audit/báo cáo, không thay đổi logic locking.

3. **`InboundItem.unitCost` là snapshot giá nhập tại thời điểm đó** — không lấy `SKU.cost` hiện tại, cùng nguyên tắc với `unitPrice` ở Reservation/SalesOrder.

4. **Luồng xử lý lúc chuyển status → `RECEIVED` (bước duy nhất chạm Inventory):**

   ```
   BEGIN transaction
     SELECT * FROM Inventory WHERE warehouseId=X AND skuId IN (...)
       ORDER BY skuId ASC
       FOR UPDATE
     → với mỗi SKU trong InboundItem:
         nếu CHƯA có row Inventory (SKU lần đầu nhập vào kho này) → INSERT mới (onHand = quantity)
         nếu ĐÃ có row → UPDATE onHand += quantity, version += 1
     → UPDATE Inbound.status = RECEIVED, receivedAt = now()
     → INSERT InventoryMovement (audit log, movementType = INBOUND)
   COMMIT
   ```

   Vẫn cần `FOR UPDATE` dù Inbound chỉ **cộng** kho (không có rủi ro oversell theo hướng ngược) — vì nếu 2 phiếu Inbound của cùng 1 SKU/Warehouse được `RECEIVED` đồng thời mà không lock, có thể xảy ra lost update (đọc `onHand` cũ, ghi đè thay vì cộng dồn đúng) nếu code lỡ dùng pattern đọc-rồi-ghi thay vì increment atomic.

5. **Trường hợp SKU lần đầu nhập vào 1 Warehouse chưa từng có Inventory row** — cần upsert (insert nếu chưa tồn tại) thay vì luôn assume row đã có sẵn, khác với Reservation/SalesOrder/Outbound (luôn yêu cầu row đã tồn tại từ trước, nếu không có nghĩa là chưa từng nhập kho, không thể bán/xuất).
