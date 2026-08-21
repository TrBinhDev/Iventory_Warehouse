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

  code            String          @unique @db.VarChar(30)

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

  quantityOrdered   Int
  quantityReceived  Int?

  unitCost          Decimal       @db.Decimal(15, 2)

  note              String?

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
- `reason = CUSTOMER_RETURN` → `salesOrderId` bắt buộc (biết trả hàng thuộc đơn nào), `supplierId` phải `null`, **và đơn phải đang `COMPLETED`** — chặn cả đơn chưa giao (`PENDING`/`PAID`/`CONFIRMED`) lẫn đơn không còn hàng thật để trả (`CANCELLED`/`REFUNDED`). Chốt ngày 2026-08-20, ban đầu doc không đặt ràng buộc này, chỉ check `salesOrderId` tồn tại — quá lỏng vì tạo được phiếu trả hàng cho đơn còn chưa giao.

Về mặt Inventory, cả 2 nhánh xử lý **giống hệt nhau** ở bước `RECEIVED` (cùng cộng `onHand`, cùng cần `FOR UPDATE` + upsert) — `reason` chỉ phục vụ mục đích audit/báo cáo, không thay đổi logic locking.

3. **`InboundItem.unitCost` là snapshot giá nhập tại thời điểm đó** — không lấy `SKU.cost` hiện tại, cùng nguyên tắc với `unitPrice` ở Reservation/SalesOrder.

3b. **`quantity` tách thành `quantityOrdered` + `quantityReceived` (nullable)** — cùng pattern đã dùng ở `TransferItem.quantityShipped`/`quantityReceived`. `quantityOrdered` là số dự kiến nhập, nhập ngay lúc tạo phiếu (`DRAFT`/`CONFIRMED`); `quantityReceived` chỉ có giá trị sau khi chuyển `RECEIVED` — staff tại kho tự nhập số thực tế nhận được, có thể khác `quantityOrdered` nếu nhà cung cấp giao thiếu/dư. Chênh lệch giữa 2 số này chỉ ghi qua `note`, **không tự động tạo `InventoryAdjustment`** — cùng nguyên tắc với chênh lệch `quantityShipped` vs `quantityReceived` ở Transfer.

4. **Luồng xử lý lúc chuyển status → `RECEIVED` (bước duy nhất chạm Inventory):**

   ```
   BEGIN transaction
     → staff nhập quantityReceived thực tế cho từng InboundItem
     → UPDATE InboundItem SET quantityReceived = ...
     SELECT * FROM Inventory WHERE warehouseId=X AND skuId IN (...)
       ORDER BY skuId ASC
       FOR UPDATE
     → với mỗi SKU trong InboundItem:
         nếu CHƯA có row Inventory (SKU lần đầu nhập vào kho này) → INSERT mới (onHand = quantityReceived)
         nếu ĐÃ có row → UPDATE onHand += quantityReceived, version += 1
     → UPDATE Inbound.status = RECEIVED, receivedAt = now()
     → INSERT InventoryMovement (audit log, movementType = INBOUND)
   COMMIT
   ```

   Cộng `onHand` theo **`quantityReceived`** (số thực nhận), không phải `quantityOrdered` (số dự kiến) — hàng thực tế về bao nhiêu thì tồn kho tăng đúng bấy nhiêu, kể cả khi khác số đặt ban đầu.

   Vẫn cần `FOR UPDATE` dù Inbound chỉ **cộng** kho (không có rủi ro oversell theo hướng ngược) — vì nếu 2 phiếu Inbound của cùng 1 SKU/Warehouse được `RECEIVED` đồng thời mà không lock, có thể xảy ra lost update (đọc `onHand` cũ, ghi đè thay vì cộng dồn đúng) nếu code lỡ dùng pattern đọc-rồi-ghi thay vì increment atomic.

5. **Trường hợp SKU lần đầu nhập vào 1 Warehouse chưa từng có Inventory row** — cần upsert (insert nếu chưa tồn tại) thay vì luôn assume row đã có sẵn, khác với Reservation/SalesOrder/Outbound (luôn yêu cầu row đã tồn tại từ trước, nếu không có nghĩa là chưa từng nhập kho, không thể bán/xuất).

6. **`code`** — mã phiếu nhập dễ đọc (VD `IN-20260811-0001`), cùng nguyên tắc với `Reservation.code`.

7. **Phân quyền theo status** (chốt bổ sung — trước đây quyền chỉ suy ra gián tiếp được từ `Business_InventoryAdjustment.md` điểm 3, ba doc Inbound/Outbound/Transfer không phát biểu tường minh):

   | Hành động | Staff | Manager | Admin |
   |---|:---:|:---:|:---:|
   | Tạo phiếu (`DRAFT`) | ✓ | ✓ | ✓ |
   | Duyệt (`DRAFT → CONFIRMED`) | ✗ | ✓ | ✓ |
   | Nhận hàng (`CONFIRMED → RECEIVED`) | ✓ | ✓ | ✓ |
   | Huỷ khi đang `DRAFT` | ✓ | ✓ | ✓ |
   | Huỷ khi đang `CONFIRMED` | ✗ | ✓ | ✓ |

   Nguyên tắc phân tách: **duyệt là quyết định phê chuẩn** nên cần cấp trên; **nhận hàng là ghi nhận sự thật vật lý** nên để Staff làm — chính họ là người đứng tại kho đếm hàng và nhập `quantityReceived` (điểm 3b). Bắt Manager tự tay xác nhận mỗi chuyến hàng về chỉ tạo nút thắt cổ chai, không thêm kiểm soát, vì phiếu đã được duyệt từ trước.

   Riêng quyền huỷ đi theo nguyên tắc **tương xứng với quyền đã tạo ra trạng thái hiện tại**: huỷ bản nháp chưa ai duyệt thì người nhập tự huỷ được; huỷ phiếu đã duyệt là đảo ngược quyết định của cấp trên nên phải cấp tương đương mới được đảo.

   Mọi thao tác đều kèm ABAC: Staff/Manager chỉ đụng được phiếu thuộc đúng `warehouseId` của mình, Admin không giới hạn (cùng nguyên tắc với điểm 2).

   Huỷ phiếu **không chạm `Inventory`** (vì `DRAFT`/`CONFIRMED` chưa từng cộng `onHand`) — chỉ update status + `cancelledAt`, không cần transaction/lock, không ghi `InventoryMovement`.

8. **Bước `receive` định danh dòng hàng theo `InboundItem.id` (`itemId`), KHÔNG phải `skuId`.** 1 phiếu có thể có 2 dòng cùng SKU (2 lô hàng khác đơn giá `unitCost`) — `skuId` không đủ để tách dòng nào là dòng nào trong body. Client phải gửi **đủ mọi `itemId`** của phiếu, thiếu hoặc thừa (id lạ) đều bị chặn (`ITEMS_MISMATCH`) — không suy luận ngầm số thiếu bằng `quantityOrdered`.

   ⚠️ **Lỗ hổng validate nhẹ đã dính (2026-08-21, sửa trước khi commit `transfer`), phát hiện khi rà lại code sau khi bắt được bug nặng hơn ở `transfer.receive`:** check "đủ mọi itemId" ban đầu chỉ so `Set(dbItemIds).size === Set(bodyItemIds).size` — nếu body gửi **trùng `itemId`** (2 dòng cùng id, số khác nhau), `Set` tự dedupe nên size không đổi, request **lọt qua** dù có dòng thừa. May mắn **không corrupt dữ liệu thật** — vì bước tính delta tồn kho (`totalBySkuId`) lặp qua `skuByItemId` (dựng từ `dbItems`, vốn đã duy nhất theo thiết kế DB) chứ không lặp qua mảng body thô, và `quantityByItemId` là `Map` (ghi đè theo key, không cộng dồn) nên chỉ giá trị dòng **cuối cùng** trong body được dùng. Nhưng đây vẫn là hành vi sai — âm thầm dùng nhầm giá trị thay vì từ chối, vi phạm đúng luật "gửi đủ, không suy luận ngầm" của chính note này. Sửa bằng cách thêm điều kiện `bodyItemIds.size !== input.items.length` vào chốt `mismatched` — phát hiện được ngay khi `Set` dedupe làm mất bớt phần tử so với mảng gốc.

   Trước khi tính delta tồn kho, các dòng **cùng `skuId`** được gộp lại (cộng `quantityReceived`) rồi mới gọi 1 lần `applyInventoryDeltas` cho mỗi SKU — tránh 2 movement cùng SKU lấy chung 1 mốc `onHandBefore` (giá trị khoá ban đầu), làm sai audit dù `onHand` cuối vẫn đúng nhờ `increment` atomic.

9. **SKU lần đầu về kho — `ensureInventoryRows` chèn dòng `Inventory` bằng `INSERT ... ON CONFLICT DO NOTHING`, không phải check-rồi-tạo.** 2 phiếu khác nhau cùng nhận cùng 1 SKU mới lần đầu vào cùng kho, chạy đồng thời: không có race, vì bên "thua" chỉ đơn giản không chèn được gì (dòng đã có), rồi cả hai cùng đọc dòng đó qua `lockInventoryRows` và xếp hàng chờ `FOR UPDATE` như bình thường. Hàm này khởi tạo `onHand = 0`, chỉ đảm bảo **có dòng để khoá** — `applyInventoryDeltas` ngay sau đó mới là nơi cộng số thật. Đã kiểm bằng test đồng thời: 6 phiếu cùng nhận 1 SKU mới cùng lúc → tồn cuối đúng tổng, audit chain liên tục, không lỗi khoá trùng.

10. **`code` sinh từ sequence `inbound_code_seq`** (raw SQL, Prisma không mô hình hoá sequence độc lập) — cùng khuôn `reservation_code_seq`/`sales_order_code_seq`, dạng `IN-YYYYMMDD-XXXXXX`.

11. **`GET /inbounds` không có ô `search` gộp** — khác `warehouse`/`supplier`/`user`/`category` (có ô `search`) và `sales-order`/`reservation` (có ô `customer`). Bảng `Inbound` không có cột định danh dạng tên/email/sđt để gộp; filter rời `status`/`reason`/`warehouseId`/`supplierId` + `code` (contains, cần index GIN trigram) là đủ.

12. **Không cần `Idempotency-Key`**, khác `sales-order`. Double-submit ở `receive`/`confirm`/`cancel` đã bị chặn bởi chính điều kiện `WHERE status = <nguồn>` trong `updateInboundStatus` (lần 2 luôn ra 0 dòng → 409) — không có rủi ro "trừ tiền 2 lần" như `sales-order` để cần thêm lớp chặn riêng.

## API đã triển khai

| Method | Path | Chức năng nghiệp vụ | Ghi `Inventory` |
|---|---|---|---|
| `POST` | `/inbounds` | Lập phiếu nhập nháp — khai supplier hoặc đơn trả hàng, danh sách SKU + số dự kiến + đơn giá | ❌ |
| `GET` | `/inbounds` | Danh sách có phân trang, lọc trạng thái/kho/NCC/lý do/mã | ❌ |
| `GET` | `/inbounds/:id` | Chi tiết + dòng hàng + dòng thời gian ai bấm bước nào | ❌ |
| `PATCH` | `/inbounds/:id/confirm` | Duyệt phiếu, cho phép nhận hàng | ❌ |
| `PATCH` | `/inbounds/:id/receive` | Ghi số thực nhận từng dòng, **cộng `onHand` thật** | ✅ `onHand +=` |
| `PATCH` | `/inbounds/:id/cancel` | Huỷ phiếu còn `DRAFT`/`CONFIRMED` | ❌ |

`GET /inbounds` nhận: `page`, `limit`, `status`, `reason`, `warehouseId`, `supplierId`, `code`. Không có `search` gộp — xem note 11.
