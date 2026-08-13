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

  code              String          @unique @db.VarChar(30)

  fromWarehouseId   String          @db.Uuid
  fromWarehouse     Warehouse       @relation("TransferFrom", fields: [fromWarehouseId], references: [id])

  toWarehouseId     String          @db.Uuid
  toWarehouse       Warehouse       @relation("TransferTo", fields: [toWarehouseId], references: [id])

  createdByUserId   String          @db.Uuid
  createdBy         User            @relation(fields: [createdByUserId], references: [id])

  status            TransferStatus  @default(DRAFT)

  confirmedAt       DateTime?
  shippedAt         DateTime?
  receivedAt        DateTime?
  cancelledAt       DateTime?
  cancelReason      String?

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

9. **`code`** — mã phiếu chuyển kho dễ đọc (VD `TRF-20260811-0001`), cùng nguyên tắc với `Reservation.code`.

10. **Phân quyền theo status** (chốt bổ sung — cùng bảng với `Business_Inbound.md` điểm 7 và `Business_Outbound.md` điểm 9):

    | Hành động | Staff | Manager | Admin | Thuộc kho nào |
    |---|:---:|:---:|:---:|---|
    | Tạo phiếu (`DRAFT`) | ✓ | ✓ | ✓ | kho nguồn (A) |
    | Duyệt (`DRAFT → CONFIRMED`) | ✗ | ✓ | ✓ | kho nguồn (A) |
    | Xuất hàng (`CONFIRMED → SHIPPED`) | ✓ | ✓ | ✓ | kho nguồn (A) |
    | Nhận hàng (`SHIPPED → RECEIVED`) | ✓ | ✓ | ✓ | **kho đích (B)** |
    | Huỷ khi đang `DRAFT` | ✓ | ✓ | ✓ | kho nguồn (A) |
    | Huỷ khi đang `CONFIRMED` | ✗ | ✓ | ✓ | kho nguồn (A) |

    Nguyên tắc phân tách giống Inbound/Outbound: **duyệt cần cấp trên, thao tác vật lý để Staff làm**.

    **Điểm ABAC riêng của Transfer, khác hẳn 2 module kia:** phiếu này liên quan 2 kho nên không thể check ABAC bằng một `warehouseId` duy nhất. Cụ thể:
    - 4 hành động đầu + huỷ: check `actor.warehouseId === transfer.fromWarehouseId`
    - Riêng `RECEIVED`: check `actor.warehouseId === transfer.toWarehouseId` — người nhận hàng là nhân viên **kho đích**, không phải kho nguồn. Nếu dùng nhầm `fromWarehouseId` ở đây thì nhân viên kho B sẽ không bao giờ xác nhận nhận hàng được.

    Admin không bị giới hạn ở cả 2 phía.

    Huỷ phiếu chỉ cho phép khi `DRAFT`/`CONFIRMED` — lúc đó chưa chạm `Inventory` kho nào (điểm 3), nên chỉ update status, không cần transaction/lock. Đã `SHIPPED` thì không huỷ được vì kho A đã trừ `onHand`, muốn đảo phải tạo phiếu Transfer ngược lại.

    Liên quan: điểm 8 đã nêu schema hiện chỉ có 1 `createdByUserId` (nhân viên kho nguồn tạo phiếu), không track riêng ai xác nhận `RECEIVED` ở kho B. Nếu muốn audit đầy đủ theo bảng phân quyền này thì cân nhắc thêm `receivedByUserId` (nullable) khi làm module.
