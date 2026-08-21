## Business — InventoryAdjustment

```prisma
enum AdjustmentStatus {
  DRAFT
  COMPLETED
}

enum AdjustmentReason {
  STOCK_COUNT
  DAMAGED
  LOST
  OTHER
}

model InventoryAdjustment {
  id              String                    @id @default(uuid()) @db.Uuid

  code            String                    @unique @db.VarChar(30)

  warehouseId     String                    @db.Uuid
  warehouse       Warehouse                 @relation(fields: [warehouseId], references: [id])

  createdByUserId String                    @db.Uuid
  createdBy       User                      @relation(fields: [createdByUserId], references: [id])

  reason          AdjustmentReason          @default(STOCK_COUNT)

  note            String?

  status          AdjustmentStatus          @default(DRAFT)

  completedAt     DateTime?

  items           InventoryAdjustmentItem[]

  createdAt       DateTime                  @default(now())
  updatedAt       DateTime                  @updatedAt

  @@index([status])
  @@index([warehouseId])
}

model InventoryAdjustmentItem {
  id                String                @id @default(uuid()) @db.Uuid

  adjustmentId      String                @db.Uuid
  adjustment        InventoryAdjustment   @relation(fields: [adjustmentId], references: [id])

  skuId             String                @db.Uuid
  sku               SKU                   @relation(fields: [skuId], references: [id])

  quantityBefore    Int

  quantityAfter     Int

  expectedVersion   Int

  createdAt         DateTime              @default(now())

  @@index([adjustmentId])
  @@index([skuId])
}
```

## Relationship

```text
Warehouse            (1) ─────────────< InventoryAdjustment (N)
User                 (1) ─────────────< InventoryAdjustment (N)      // createdBy
InventoryAdjustment  (1) ─────────────< InventoryAdjustmentItem (N)
SKU                  (1) ─────────────< InventoryAdjustmentItem (N)
```

## Note — các điểm quan trọng

1. **Hướng A đã chốt — set trực tiếp `onHand` mới, không nhập số chênh lệch:** Admin/Manager kiểm kê thực tế, nhập thẳng `quantityAfter` (số đếm được). `quantityBefore` là snapshot số hệ thống đang ghi tại thời điểm mở form kiểm kê (đọc ra để hiển thị + dùng tính delta cho `InventoryMovement` sau này: `delta = quantityAfter - quantityBefore`).

2. **Chỉ 2 status (`DRAFT` → `COMPLETED`), không có `CONFIRMED` ở giữa** — khác với Inbound/Outbound/Transfer. Vì đây là hành động kiểm kê xong nhập liệu và xác nhận tại chỗ, không có khoảng chờ "đang vận chuyển"/"chờ hàng về" như 3 bảng kia.

3. **Phân quyền — chỉ `WAREHOUSE_MANAGER` hoặc `ADMIN` được tạo VÀ hoàn tất Adjustment**, không cho `WAREHOUSE_STAFF`. Khác với Inbound/Outbound/Transfer (Staff tạo được, chỉ bước duyệt mới cần Manager/Admin — xem bảng phân quyền đầy đủ ở `Business_Inbound.md` điểm 7, `Business_Outbound.md` điểm 9, `Business_Transfer.md` điểm 10) — Adjustment không cho Staff động vào ở bất kỳ bước nào. Validate ở service layer/middleware, không phải DB constraint.

   Lý do siết chặt hơn hẳn 3 module kia: Adjustment là nghiệp vụ **duy nhất đổi được `onHand` mà không cần đối chứng vật lý nào**. Inbound phải có hàng nhà cung cấp giao, Outbound phải có hàng đi ra, Transfer có kho bên kia đối chiếu — còn Adjustment chỉ cần khai "thực tế đếm được N cái" là số trong hệ thống đổi theo. Nếu cho Staff quyền này thì chính người hàng ngày cầm hàng cũng là người tự chỉnh sổ, mất hàng rồi chỉnh sổ cho khớp sẽ không ai phát hiện. Tách quyền khỏi người trực tiếp thao tác hàng là nguyên tắc kiểm soát nội bộ (separation of duties).

4. **`expectedVersion` — cốt lõi của Optimistic Locking:**
   - Lúc mở form kiểm kê (tạo `DRAFT`), đọc `Inventory.version` hiện tại, lưu vào `expectedVersion` của từng `InventoryAdjustmentItem`.
   - Lúc submit (`DRAFT → COMPLETED`), **không dùng `SELECT ... FOR UPDATE`** — thay vào đó chạy:
     ```ts
     const result = await tx.inventory.updateMany({
       where: { id: inventoryId, version: expectedVersion },
       data: { onHand: quantityAfter, version: { increment: 1 } },
     });
     if (result.count === 0) throw new ConflictError();
     // version đã bị đổi bởi giao dịch khác (VD: Outbound xử lý ngay trong lúc Admin đang kiểm kê)
     // → toàn bộ Adjustment fail, KHÔNG tự động merge, bắt Admin reload dữ liệu mới rồi làm lại
     ```

5. **Edge case quan trọng — validate `quantityAfter >= reserved` hiện tại của SKU đó:** Nếu kho đang có 10 cái, trong đó 6 cái bị giữ chỗ (`reserved = 6`), Admin kiểm kê ra chỉ còn 4 cái thực tế (`quantityAfter = 4`) → **không hợp lệ**, vì `reserved` không thể lớn hơn `onHand` (đã có CHECK constraint này ở Inventory từ trước). Trường hợp này hệ thống phải từ chối submit và báo lỗi rõ ràng (VD: "Không thể điều chỉnh xuống 4 vì đang có 6 đơn giữ chỗ chưa xử lý") — không tự động hủy các Reservation/SalesOrder liên quan.

6. **`reserved` KHÔNG bị Adjustment đụng vào** — chỉ set lại `onHand`, giữ nguyên `reserved` hiện tại (trừ trường hợp vi phạm CHECK constraint ở điểm 5 thì bị chặn từ đầu).

7. **`InventoryAdjustmentItem` không có `updatedAt`** — cùng nguyên tắc snapshot bất biến như `ReservationItem`/`SalesOrderItem`, không sửa sau khi đã submit.

8. **`code`** — mã phiếu điều chỉnh dễ đọc (VD `ADJ-20260811-0001`), cùng nguyên tắc với `Reservation.code`.

9. **Chốt khi code (2026-08-21): thêm `DELETE /inventory-adjustments/:id`, chỉ cho phiếu còn `DRAFT`.** Enum `AdjustmentStatus` không có `CANCELLED` nên không có cách chính thức "huỷ" — xoá cứng là cách duy nhất dọn phiếu mở nhầm. Không phải thiếu sót: `DRAFT` là **giai đoạn duy nhất** có "khoảng hở" để đổi ý, vì `complete` gộp cả "nộp" và "áp dụng vào tồn kho" trong CÙNG 1 hành động (khác `inbound`/`outbound`/`transfer` có khoảng cách vật lý thật giữa duyệt và xuất/nhận, nên mới cần `CANCELLED` riêng). Sau `COMPLETED` thì không xoá/huỷ được — muốn sửa sai phải mở phiếu Adjustment mới, đúng nguyên tắc audit giữ lại dấu vết.

   ⚠️ **Race condition đã tự phát hiện lúc code (chưa từng chạy để lộ ra) — giữa `DELETE` và `complete` chạy đồng thời trên cùng 1 phiếu:** nếu `DELETE` chỉ đọc `status` riêng rồi mới xoá (không khoá gì), trong lúc đó `complete` chạy xong trước và áp dụng thật vào `Inventory` (ghi `InventoryMovement` thật), `DELETE` phía sau vẫn xoá theo giá trị `status` cũ đã đọc — xoá mất `InventoryAdjustmentItem` gốc của 1 lần đổi tồn kho ĐÃ THẬT SỰ XẢY RA, chỉ còn `InventoryMovement` mồ côi không đối chiếu được nữa. Sửa bằng `SELECT ... FOR UPDATE` trên chính dòng `InventoryAdjustment` trước khi xoá — không phải để tránh ABBA (không có tài nguyên thứ 2) mà để chặn race với chính `complete` (vốn cũng khoá dòng này qua `UPDATE` điều kiện `status='DRAFT'`). Đã kiểm bằng test đồng thời thật: 8 cặp `complete` vs `delete` chạy song song trên 8 phiếu khác nhau → mọi cặp đều dứt khoát (1 `complete` thắng, 7 `delete` thắng trong 1 lần chạy — tỉ lệ ngẫu nhiên), không phiếu nào rơi vào trạng thái vừa mất item vừa còn `COMPLETED`.

## API đã triển khai

| Method | Path | Chức năng nghiệp vụ | Ghi `Inventory` |
|---|---|---|---|
| `POST` | `/inventory-adjustments` | Mở phiếu kiểm kê — snapshot `quantityBefore`+`expectedVersion` từ tồn hiện tại | ❌ |
| `GET` | `/inventory-adjustments` | Danh sách có phân trang, lọc trạng thái/kho/lý do/mã | ❌ |
| `GET` | `/inventory-adjustments/:id` | Chi tiết + dòng hàng + dòng thời gian ai bấm bước nào | ❌ |
| `PATCH` | `/inventory-adjustments/:id/complete` | Set `onHand` mới theo số đếm được — **khoá optimistic, KHÔNG `FOR UPDATE`** | ✅ `onHand :=` (set thẳng, không cộng dồn) |
| `DELETE` | `/inventory-adjustments/:id` | Xoá cứng phiếu còn `DRAFT` | ❌ |

`GET /inventory-adjustments` nhận: `page`, `limit`, `status`, `reason`, `warehouseId`, `code`. Không có `search` gộp — cùng lý do `inbound`/`outbound`/`transfer`.

**Phân quyền: CHỈ `WAREHOUSE_MANAGER`/`ADMIN`, ở MỌI route kể cả xem** — khác hẳn 3 module trước (đều cho Staff xem, chỉ chặn ở bước duyệt/tạo). `WAREHOUSE_STAFF` bị chặn `403` ngay từ route, không lộ được cả danh sách kiểm kê của kho mình — đúng tinh thần kiểm soát nội bộ ở note 3.
