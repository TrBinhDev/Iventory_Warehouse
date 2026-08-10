## Business — Transfer

```prisma
enum TransferStatus {
  DRAFT
  CONFIRMED
  SHIPPED
  RECEIVED
  CANCELLED
}

model Transfer {
  id                String          @id @default(uuid()) @db.Uuid

  fromWarehouseId   String          @db.Uuid
  fromWarehouse     Warehouse       @relation("TransferFrom", fields: [fromWarehouseId], references: [id])

  toWarehouseId     String          @db.Uuid
  toWarehouse       Warehouse       @relation("TransferTo", fields: [toWarehouseId], references: [id])

  createdByUserId   String          @db.Uuid
  createdBy         User            @relation(fields: [createdByUserId], references: [id])

  status            TransferStatus  @default(DRAFT)

  shippedAt         DateTime?
  receivedAt        DateTime?

  items             TransferItem[]

  createdAt         DateTime        @default(now())
  updatedAt         DateTime        @updatedAt

  @@index([status])
  @@index([fromWarehouseId])
  @@index([toWarehouseId])
}

model TransferItem {
  id                String        @id @default(uuid()) @db.Uuid

  transferId        String        @db.Uuid
  transfer          Transfer      @relation(fields: [transferId], references: [id])

  skuId             String        @db.Uuid
  sku               SKU           @relation(fields: [skuId], references: [id])

  quantityShipped   Int

  quantityReceived  Int?

  note              String?

  createdAt         DateTime      @default(now())

  @@index([transferId])
  @@index([skuId])
}
```

## Relationship

```text
Warehouse (1) ─────────────< Transfer (N)   // fromWarehouse (relation "TransferFrom")
Warehouse (1) ─────────────< Transfer (N)   // toWarehouse (relation "TransferTo")
User      (1) ─────────────< Transfer (N)   // createdBy - nhân viên tạo phiếu
Transfer  (1) ─────────────< TransferItem (N)
SKU       (1) ─────────────< TransferItem (N)
```

## Note — các điểm quan trọng

1. **`fromWarehouseId`/`toWarehouseId` cần đặt tên relation riêng** (`@relation("TransferFrom", ...)` và `@relation("TransferTo", ...)`) — vì Prisma bắt buộc phải named relation khi có nhiều hơn 1 quan hệ trỏ tới cùng 1 model (`Warehouse`). Nếu không đặt tên, Prisma sẽ báo lỗi ambiguous relation lúc generate.

2. **Validate `fromWarehouseId !== toWarehouseId` ở service layer** — Prisma/DB không tự chặn được việc chuyển kho tới chính nó.

3. **Status flow 2 giai đoạn — mỗi giai đoạn là 1 transaction riêng, chạm Inventory ở 2 kho khác nhau, tại 2 thời điểm khác nhau:**
   - `DRAFT`: staff tạo phiếu, chưa chạm Inventory
   - `CONFIRMED`: đã duyệt, chưa xuất, chưa chạm Inventory
   - `SHIPPED`: kho nguồn (A) xuất hàng thật — **chỉ trừ `onHand` kho A**, chưa cộng gì vào kho B
   - `RECEIVED`: kho đích (B) xác nhận đã nhận hàng thật — **lúc này mới cộng `onHand` kho B**, dựa trên số lượng B tự nhập (`quantityReceived`), không tự động lấy `quantityShipped`
   - `CANCELLED`: chỉ cho phép khi đang `DRAFT` hoặc `CONFIRMED`, cùng nguyên tắc với Inbound/Outbound

   Trong khoảng giữa `SHIPPED` và `RECEIVED`, tổng `onHand` toàn hệ thống (A + B) tạm thời **giảm đi đúng bằng số hàng đang trên đường** — đúng thực tế vật lý, không phải bug.

4. **Luồng `SHIPPED` (chỉ lock Inventory kho A):**

   ```
   BEGIN transaction
     SELECT * FROM Inventory WHERE warehouseId=A AND skuId IN (...)
       ORDER BY skuId ASC FOR UPDATE
     → check onHand đủ ở kho A cho từng SKU
     → UPDATE Inventory (kho A): onHand -= quantityShipped, version += 1
     → UPDATE Transfer.status = SHIPPED, shippedAt = now()
     → INSERT InventoryMovement (kho A, movementType = TRANSFER_OUT)
   COMMIT
   ```

5. **Luồng `RECEIVED` (chỉ lock Inventory kho B, transaction hoàn toàn riêng biệt với bước 4):**

   ```
   BEGIN transaction
     SELECT * FROM Inventory WHERE warehouseId=B AND skuId IN (...)
       ORDER BY skuId ASC FOR UPDATE
     → với mỗi SKU: nếu chưa có row Inventory ở kho B → upsert (giống Inbound)
     → UPDATE quantityReceived vào từng TransferItem (staff kho B tự nhập số thực nhận)
     → UPDATE Inventory (kho B): onHand += quantityReceived, version += 1
     → UPDATE Transfer.status = RECEIVED, receivedAt = now()
     → INSERT InventoryMovement (kho B, movementType = TRANSFER_IN)
   COMMIT
   ```

6. **Chênh lệch `quantityShipped` vs `quantityReceived` chỉ ghi qua `note`, KHÔNG tự động tạo `InventoryAdjustment`.** Vì thông tin thất thoát đã nằm sẵn trong chính `TransferItem` (tính được `quantityShipped - quantityReceived`) và `InventoryMovement` (audit log gốc của cả 2 bước) — không cần thêm 1 record quản trị riêng. `InventoryAdjustment` chỉ dành cho nghiệp vụ kiểm kê chủ động, không phải hệ quả tự động của Transfer.

7. **`quantityReceived` nullable** — vì chỉ có giá trị sau khi `RECEIVED`, lúc `SHIPPED` (hoặc `DRAFT`/`CONFIRMED`) vẫn là `null`.

8. **`createdByUserId`** — track nhân viên tạo phiếu ở kho nguồn. Việc "ai xác nhận RECEIVED ở kho B" không track riêng trong schema hiện tại (chỉ có 1 `createdByUserId` cho cả phiếu) — nếu cần audit rõ ai xác nhận nhận hàng, có thể thêm `receivedByUserId` (nullable) sau, hiện tại giữ tối giản.
