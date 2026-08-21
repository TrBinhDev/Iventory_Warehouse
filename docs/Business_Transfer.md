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

    Liên quan: điểm 8 đã nêu schema hiện chỉ có 1 `createdByUserId` (nhân viên kho nguồn tạo phiếu), không track riêng ai xác nhận `RECEIVED` ở kho B. **Chốt khi code (2026-08-21): KHÔNG thêm cột `receivedByUserId`** — dùng `DocumentStatusHistory` (`documentType='TRANSFER', toStatus='RECEIVED'` → `changedByUserId`) để trả lời "ai nhận hàng". Bảng đó sinh ra chính xác để giải quyết bài toán này (xem `Business_DocumentStatusHistory.md`, phần "Vì sao có bảng này") — thêm cột riêng cho 1 bước mà bỏ qua 3 bước kia (`confirm`/`ship`/`cancel`) là không nhất quán.

11. **Đính chính dự đoán ban đầu: KHÔNG có nguy cơ khoá 2 kho cùng lúc.** `SHIPPED` và `RECEIVED` là 2 transaction hoàn toàn tách biệt (note 4, 5) — `ship` chỉ khoá `Inventory` kho A, `receive` chỉ khoá `Inventory` kho B, không transaction nào cầm khoá của cả 2 kho cùng lúc. Thiết kế 2-transaction này tự động tránh được vấn đề thứ tự khoá giữa 2 `warehouseId` mà lẽ ra sẽ cần nếu 1 transaction đụng cả 2 kho (như deadlock đã gặp và sửa ở `outbound` — xem note 11 của `Business_Outbound.md`).

12. **Check ở bước `SHIPPED` là chốt CÓ THẬT, khác `OUT_OF_STOCK` bên `outbound` (đã verify là không thể chạm tới vì có `reserved` bảo đảm trước).** `Transfer` KHÔNG đụng `reserved` ở bất kỳ bước nào — lúc tạo phiếu (`DRAFT`) không có gì giữ chỗ số lượng đó, nên giữa lúc tạo và lúc `SHIPPED` thật, `onHand` kho nguồn hoàn toàn có thể bị giao dịch khác tiêu thụ trước. Đã kiểm bằng test đồng thời thật: `onHand=10`, 2 phiếu cùng xin 8 (tổng 16 > 10), `ship` đồng thời → đúng 1 phiếu thành công (`onHand` còn 2), phiếu kia nhận `OUT_OF_STOCK` thật — không phải suy luận lý thuyết.

    ⚠️ **Bug thật đã dính lúc code (2026-08-21, sửa trước khi commit), user tự phát hiện bằng câu hỏi:** *"onHand có 100 mà reserved có 70 thì mình chuyển kho đi 40 thì sao?"* Bản đầu chỉ check `onHand >= quantityShipped` (`100 >= 40` → cho qua), **KHÔNG trừ `reserved` ra trước** — chuyển đi 40 thì `reserved` (70) còn lại lớn hơn `onHand` (60), vi phạm bất biến `reserved <= onHand` mà không tầng nào ở service chặn được. Lọt xuống DB thì `CHECK constraint Inventory_quantityReserved_lte_onHand` mới chặn (Postgres `23514`), transaction rollback đúng (không hỏng dữ liệu) nhưng lộ ra thành `500 INTERNAL_ERROR` thô thay vì `409 OUT_OF_STOCK` sạch.

    Sửa: so với **AVAILABLE** (`onHand - reserved`), không phải `onHand` trần — cùng công thức `available` mà `reservation`/`sales-order` dùng để check đủ hàng lúc giữ chỗ. Đã kiểm lại bằng 3 ca: `onHand=100, reserved=70`, chuyển 40 (> available 30) → `409 OUT_OF_STOCK` sạch, `Inventory` không đổi; chuyển đúng 30 (= available) → `200 OK`; `reserved=0`, chuyển gần hết `onHand` → vẫn `200 OK` bình thường (không bị chặn oan khi không có gì giữ chỗ).

13. **Gộp dòng trùng SKU trong 1 phiếu lúc tạo**, cùng lý do và cùng cách `outbound`: `TransferItem` không có giá riêng từng dòng (`quantityShipped`/`quantityReceived`/`note` không cái nào phân biệt được 2 dòng cùng SKU), nên 2 dòng trùng SKU vô nghĩa nếu giữ riêng. Hệ quả: bước `receive` định danh theo `skuId` (không phải `TransferItem.id`) — vì sau khi gộp, mỗi phiếu tối đa 1 dòng/SKU nên `skuId` đủ để định danh không mơ hồ, khác `inbound.receive` (phải dùng `itemId` vì có thể có nhiều dòng cùng SKU khác lô/giá thật sự).

    ⚠️ **Bug thật thứ 2 đã dính lúc code (2026-08-21, sửa trước khi commit), phát hiện khi rà lại code sau bug đầu tiên (note 12) chứ không phải do test tự động bắt được:** vì mỗi phiếu chỉ có tối đa 1 dòng/SKU (do đã gộp ở trên), tôi ngỡ body `receive` không thể có 2 dòng trùng `skuId` — nhưng **client hoàn toàn gửi được**, không có gì ngăn. Bản đầu check "đủ mọi SKU" bằng so sánh `Set` (tự dedupe), nên 2 dòng trùng `skuId` trong body **lọt qua được** kiểm tra. Sau đó `applyInventoryDeltas` nhận thẳng mảng thô (chưa gộp) nên cộng **CẢ 2 dòng** vào `onHand` (VD gửi `{qty:3}` và `{qty:7}` thì `onHand` kho đích cộng nhầm thành 10), trong khi `TransferItem.quantityReceived` chỉ lưu dòng ghi sau cùng (7, do là `UPDATE` chứ không phải cộng dồn) — **2 nguồn dữ liệu lệch nhau**, và **không hề bị chặn**, trả `200 OK` với số liệu sai (nặng hơn bug ở note 12 vì bug đó còn bị `CHECK constraint` chặn ở tầng DB, bug này thì không vi phạm constraint nào nên lọt hẳn).

    Sửa: gộp `input.items` vào 1 `Map` theo `skuId` trước khi làm bất cứ điều gì — nếu phát hiện `skuId` trùng ngay lúc dựng `Map` thì từ chối luôn (`ITEMS_MISMATCH`), không lặng lẽ chấp nhận. Dùng `Map` này (không phải mảng thô) cho cả bước ghi `TransferItem` lẫn `applyInventoryDeltas`. Đã kiểm lại: gửi 2 dòng trùng SKU → `400 ITEMS_MISMATCH`, không đụng DB; ca 2 SKU khác nhau bình thường và ca thiếu SKU vẫn hoạt động đúng như trước.

    **Bài học áp dụng cho `inventory-adjustment`/module sau:** bất kỳ chỗ nào validate "đủ/đúng danh sách" bằng `Set` rồi sau đó lại dùng **mảng gốc** (chưa qua `Set`/`Map`) để ghi dữ liệu, đều có nguy cơ y hệt — `Set`/`Map` dùng để kiểm tra phải là **cùng một cấu trúc** dùng để ghi, không phải 2 bước tách rời.

14. **`code` sinh từ sequence `transfer_code_seq`**, dạng `TRF-YYYYMMDD-XXXXXX`, cùng khuôn 4 sequence trước.

15. **ABAC xem (list/detail) khác ABAC thao tác:** xem được nếu kho mình là NGUỒN **hoặc** ĐÍCH (cả 2 bên đều liên quan tới phiếu); thao tác (`confirm`/`ship`/`cancel`) chỉ kho NGUỒN, riêng `receive` chỉ kho ĐÍCH (note 10). Manager/Staff gửi `fromWarehouseId`/`toWarehouseId` trong query `GET /transfers` bị bỏ qua (không có tác dụng) — luôn ép theo đúng kho mình liên quan, cùng cách `inventory`/`inbound`/`outbound` xử lý `warehouseId`.

16. **Không cần `Idempotency-Key`** — double-submit ở mọi bước đổi status đã bị chặn bởi điều kiện `WHERE status = <nguồn>`, cùng lý do `inbound`/`outbound`.

## API đã triển khai

| Method | Path | Chức năng nghiệp vụ | Ghi `Inventory` |
|---|---|---|---|
| `POST` | `/transfers` | Lập phiếu chuyển kho nháp — kho nguồn, kho đích, SKU + số dự kiến | ❌ |
| `GET` | `/transfers` | Danh sách có phân trang, lọc trạng thái/kho nguồn/kho đích/mã | ❌ |
| `GET` | `/transfers/:id` | Chi tiết + dòng hàng + dòng thời gian ai bấm bước nào | ❌ |
| `PATCH` | `/transfers/:id/confirm` | Duyệt phiếu (kho nguồn), cho phép xuất | ❌ |
| `PATCH` | `/transfers/:id/ship` | Kho nguồn xác nhận đã xuất — trừ `onHand` kho A | ✅ `onHand -=` (kho A) |
| `PATCH` | `/transfers/:id/receive` | Kho đích ghi số thực nhận — cộng `onHand` kho B | ✅ `onHand +=` (kho B) |
| `PATCH` | `/transfers/:id/cancel` | Huỷ phiếu còn `DRAFT`/`CONFIRMED` (kho nguồn) | ❌ |

`GET /transfers` nhận: `page`, `limit`, `status`, `fromWarehouseId`, `toWarehouseId`, `code`. Không có `search` gộp — cùng lý do `inbound`/`outbound` (không có cột định danh dạng tên/email/sđt).
