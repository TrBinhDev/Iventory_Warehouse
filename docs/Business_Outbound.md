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

  code            String          @unique @db.VarChar(30)

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

  confirmedAt     DateTime?
  shippedAt       DateTime?
  cancelledAt     DateTime?
  cancelReason    String?

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

3. **Status flow — chỉ chạm vào Inventory ở bước `SHIPPED`, và LUÔN trừ `onHand`, nhưng CHỈ trừ thêm `reserved` khi `reason = SALES_ORDER`:**
   - `DRAFT`: staff tạo phiếu, chưa trừ gì
   - `CONFIRMED`: đã duyệt, hàng chưa rời kho — vẫn chưa trừ gì
   - `SHIPPED`: hàng thực sự rời kho — **lúc này mới** chạy transaction trừ `onHand` (mọi `reason`) và `reserved` (**chỉ `reason = SALES_ORDER`**)
   - `CANCELLED`: chỉ cho phép hủy khi đang `DRAFT` hoặc `CONFIRMED`, cùng nguyên tắc với `Inbound.CANCELLED`

   ⚠️ **Lỗi thật đã dính lúc code (2026-08-20, sửa trước khi commit):** bản đầu trừ `reserved` cho **cả 4 `reason`** không phân biệt. `RETURN_TO_SUPPLIER`/`DAMAGED`/`OTHER` không hề qua bước giữ chỗ nào (`reserved` không hề tăng vì phiếu này) — trừ `reserved` ở đó ăn nhầm vào phần đang giữ cho một `SalesOrder` **khác hoàn toàn không liên quan**, phát hiện bằng test HTTP thật: ship 1 phiếu `DAMAGED` làm `reserved` của SKU tụt về 0 dù phiếu đó không đụng gì tới đơn hàng nào, kéo theo phiếu `SALES_ORDER` ship sau bị `CHECK reserved >= 0` chặn, lộ ra thành lỗi 500 khó hiểu. Bài học: pseudocode ở note 4 (bản cũ) viết `reserved -= quantity` như một bước cố định — sai, chỉ đúng khi có sự giữ chỗ thật đứng sau.

4. **Luồng xử lý lúc chuyển status → `SHIPPED` (bước duy nhất chạm Inventory):**

   ```
   BEGIN transaction
     Nếu reason = SALES_ORDER:
       SELECT SalesOrder WHERE id = salesOrderId FOR UPDATE   ← khoá TRƯỚC Inventory (xem note 11)
       Nếu status khác CONFIRMED (đã bị huỷ/refund xen giữa) → chặn, không xuất
     SELECT * FROM Inventory WHERE warehouseId=X AND skuId IN (...)
       ORDER BY skuId ASC
       FOR UPDATE
     → với mỗi SKU trong OutboundItem:
         check onHand >= quantity (lưới an toàn, dù lý thuyết đã đủ vì reserved luôn <= onHand)
         UPDATE onHand -= quantity, version += 1
         NẾU reason = SALES_ORDER: UPDATE reserved -= quantity thêm (xem cảnh báo note 3)
     → UPDATE Outbound.status = SHIPPED, shippedAt = now()
     → nếu reason = SALES_ORDER → UPDATE SalesOrder.status = COMPLETED
       (1 SalesOrder chỉ ứng 1 Outbound — xem note 10, nên ship xong luôn là xong cả đơn,
       không cần so khớp tổng nhiều phiếu)
     → INSERT InventoryMovement (audit log, movementType = OUTBOUND)
   COMMIT
   ```

5. **Điểm khác biệt quan trọng với Inbound: Outbound LUÔN yêu cầu row Inventory đã tồn tại từ trước** — không upsert. Nếu không có row (SKU chưa từng nhập vào kho này) thì không thể xuất, throw lỗi ngay từ bước check, không phải lỗi logic mà là dữ liệu không hợp lệ (không thể xuất hàng chưa từng nhập).

6. **`reserved -= quantity` (khi có) chỉ trừ đúng phần liên quan đến `salesOrderId` của chính Outbound này** — không phải trừ/xóa toàn bộ `reserved` của SKU đó (SKU có thể đang bị giữ chỗ bởi nhiều Reservation/SalesOrder khác cùng lúc, không liên quan đến phiếu Outbound đang xử lý). Số lượng trừ lấy từ `OutboundItem.quantity`, khớp với số đã được cộng vào `reserved` lúc tạo `SalesOrder` tương ứng — khớp được vì item tự lấy từ `SalesOrderItem` (note 10), không phải do client tự gõ.

7. **`createdByUserId`** — cùng nguyên tắc với `Inbound`, track nhân viên tạo phiếu, validate `createdBy.warehouseId === Outbound.warehouseId` ở service layer.

8. **`code`** — mã phiếu xuất dễ đọc (VD `OUT-20260811-0001`), cùng nguyên tắc với `Reservation.code`.

9. **Phân quyền theo status** (chốt bổ sung — cùng bảng với `Business_Inbound.md` điểm 7 và `Business_Transfer.md` điểm 10, giữ nhất quán giữa 3 module):

   | Hành động | Staff | Manager | Admin |
   |---|:---:|:---:|:---:|
   | Tạo phiếu (`DRAFT`) | ✓ | ✓ | ✓ |
   | Duyệt (`DRAFT → CONFIRMED`) | ✗ | ✓ | ✓ |
   | Xuất hàng (`CONFIRMED → SHIPPED`) | ✓ | ✓ | ✓ |
   | Huỷ khi đang `DRAFT` | ✓ | ✓ | ✓ |
   | Huỷ khi đang `CONFIRMED` | ✗ | ✓ | ✓ |

   Nguyên tắc phân tách: **duyệt là quyết định phê chuẩn** nên cần cấp trên; **xuất hàng là ghi nhận sự thật vật lý** (hàng đã rời kho) nên Staff làm.

   Lưu ý `SHIPPED` là bước trừ CẢ `onHand` LẪN `reserved` (điểm 3) nên nhìn qua có vẻ rủi ro nhất trong 3 module — nhưng quyền quyết định cho xuất đã được chốt ở bước `CONFIRMED` trước đó, `SHIPPED` chỉ ghi lại việc hàng thực sự đi ra. Vì vậy vẫn giữ mở cho Staff, đồng bộ với `RECEIVED` của Inbound/Transfer. Nếu về sau muốn siết riêng bước này thì phải sửa cả 3 doc cho khỏi lệch nguyên tắc.

   Quyền huỷ theo nguyên tắc **tương xứng với quyền đã tạo ra trạng thái hiện tại**: nháp chưa duyệt thì người nhập tự huỷ; đã duyệt thì chỉ Manager/Admin.

   Mọi thao tác kèm ABAC theo `warehouseId` (cùng nguyên tắc điểm 7). Huỷ phiếu **không chạm `Inventory`** vì `DRAFT`/`CONFIRMED` chưa trừ gì — chỉ update status, không cần transaction/lock.

10. **1 `SalesOrder` chỉ ứng với ĐÚNG 1 phiếu `Outbound` còn hiệu lực (chưa `CANCELLED`).** Chốt ngày 2026-08-20 — ban đầu doc viết "nếu đã xuất đủ toàn bộ item của đơn" ngụ ý có thể chia nhiều phiếu, nhưng xét lại: `reserved` đã bị khoá chặt cho đơn ngay lúc tạo (`reserved += quantity`), nên lúc `ship` chắc chắn đủ hàng — **không có tình huống thiếu hàng buộc phải chia đợt xuất**. Đơn giản hoá:
    - Client tạo `Outbound` với `reason = SALES_ORDER` **không gửi `items`** — hệ thống tự lấy toàn bộ dòng từ `SalesOrderItem` của đơn đó (bắt buộc `salesOrderId` đơn đang `CONFIRMED`).
    - Check "đơn đã có phiếu Outbound active chưa" chạy **trong cùng transaction đã khoá `SalesOrder`** (note 11) — 2 request tạo phiếu đồng thời cho cùng 1 đơn tự xếp hàng chờ nhau, không race.
    - Xuất xong 1 phiếu là đơn `COMPLETED` luôn — không cần so khớp tổng nhiều phiếu.
    - Nếu sau này có nhu cầu thật (chia kiện hàng vì lý do vận hành, không phải thiếu tồn) thì mở lại, không thiết kế trước cho ca chưa xảy ra.

11. **⚠️ Thứ tự khoá — đã đổi để khớp `cancelSalesOrder`, loại bỏ nguy cơ deadlock đã cảnh báo ở `docs/Business_SalesOrder.md` note 13.**

    Nguy cơ ban đầu: `cancelSalesOrder` khoá `SalesOrder` trước → `Inventory` sau. Nếu `outbound.ship` khoá `Inventory` trước → `UPDATE SalesOrder` sau (như pseudocode gốc), 2 giao dịch chạy đồng thời trên **cùng đơn `CONFIRMED`** (đúng trạng thái cả hai đều nhắm tới — `CANCELLABLE_BY_STAFF` gồm cả `CONFIRMED`) sẽ ôm chéo lock, Postgres bắn `40P01`.

    **Đã sửa: `outbound.ship` khoá `SalesOrder` (`SELECT ... FOR UPDATE`) TRƯỚC, `Inventory` SAU** — cùng thứ tự với `cancelSalesOrder`, loại bỏ hoàn toàn khả năng ôm chéo (không phải giảm xác suất, mà 2 giao dịch không còn cách nào khoá ngược chiều nhau nữa). Cùng bước khoá này còn trả lời câu hỏi "đơn bị huỷ xen giữa lúc đang chờ ship thì sao": nếu `SalesOrder` không còn `CONFIRMED` lúc khoá được (đã bị `cancelSalesOrder` xử lý trước) → chặn ship, không xuất hàng cho đơn đã huỷ.

    Đã kiểm bằng test đồng thời thật (10 cặp `ship` vs `cancel` cùng lúc trên cùng đơn `CONFIRMED`, ép cả 2 kịch bản xảy ra bằng cách so le thứ tự gọi): **cả 2 nhánh đều dứt khoát** (6 lần ship thắng → đơn `COMPLETED`, 4 lần cancel thắng → đơn `REFUNDED` và phiếu Outbound giữ nguyên `CONFIRMED` chờ xử lý lại), không lần nào bị `40P01`/hang/trạng thái nửa vời.

12. **Xuất trùng SKU trong 1 phiếu (chỉ áp dụng nhánh nhập `items` thủ công — `RETURN_TO_SUPPLIER`/`DAMAGED`/`OTHER`) được GỘP thành 1 dòng lúc tạo**, khác `Inbound` (giữ riêng vì mỗi dòng có thể khác `unitCost`). `OutboundItem` không có giá nên 2 dòng trùng SKU không mang thông tin gì khác biệt — gộp cho gọn, cùng cách `reservation`/`sales-order` đang làm.

13. **`code` sinh từ sequence `outbound_code_seq`** (raw SQL, cùng khuôn 3 sequence trước), dạng `OUT-YYYYMMDD-XXXXXX`.

14. **`GET /outbounds` không có ô `search` gộp**, cùng lý do `Inbound` — không có cột định danh dạng tên/email/sđt. Filter rời `status`/`reason`/`warehouseId`/`salesOrderId`/`supplierId` + `code` (contains, cần trigram).

15. **Không cần `Idempotency-Key`** — double-submit ở `ship`/`confirm`/`cancel` đã bị chặn bởi điều kiện `WHERE status = <nguồn>`, cùng lý do `Inbound`.

## API đã triển khai

| Method | Path | Chức năng nghiệp vụ | Ghi `Inventory` |
|---|---|---|---|
| `POST` | `/outbounds` | Lập phiếu xuất nháp — `SALES_ORDER` tự lấy items từ đơn, 3 lý do khác nhập tay | ❌ |
| `GET` | `/outbounds` | Danh sách có phân trang, lọc trạng thái/kho/lý do/đơn/NCC/mã | ❌ |
| `GET` | `/outbounds/:id` | Chi tiết + dòng hàng + dòng thời gian ai bấm bước nào | ❌ |
| `PATCH` | `/outbounds/:id/confirm` | Duyệt phiếu, cho phép xuất hàng | ❌ |
| `PATCH` | `/outbounds/:id/ship` | Xác nhận hàng đã rời kho, **trừ `onHand`** (+ `reserved` nếu `SALES_ORDER`), có thể hoàn tất đơn | ✅ `onHand -=` (+`reserved -=` nếu SALES_ORDER) |
| `PATCH` | `/outbounds/:id/cancel` | Huỷ phiếu còn `DRAFT`/`CONFIRMED` | ❌ |

`GET /outbounds` nhận: `page`, `limit`, `status`, `reason`, `warehouseId`, `salesOrderId`, `supplierId`, `code`. Không có `search` gộp — xem note 14.
