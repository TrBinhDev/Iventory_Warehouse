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

3. **Phân quyền — chỉ `WAREHOUSE_MANAGER` hoặc `ADMIN` được tạo VÀ hoàn tất Adjustment**, không cho `WAREHOUSE_STAFF`. Khác với Inbound/Outbound/Transfer (Staff tạo được, chỉ bước duyệt mới cần Manager/Admin) — Adjustment không cho Staff động vào ở bất kỳ bước nào. Validate ở service layer/middleware, không phải DB constraint.

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
