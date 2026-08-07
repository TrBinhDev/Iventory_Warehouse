## Inventory

```prisma
model Inventory {
  id                String              @id @default(uuid()) @db.Uuid

  warehouseId       String              @db.Uuid
  warehouse         Warehouse           @relation(fields: [warehouseId], references: [id])

  skuId             String              @db.Uuid
  sku               SKU                 @relation(fields: [skuId], references: [id])

  quantityOnHand    Int                 @default(0)

  quantityReserved  Int                 @default(0)

  version           Int                 @default(0)

  movements         InventoryMovement[]

  createdAt         DateTime            @default(now())
  updatedAt         DateTime            @updatedAt

  @@unique([warehouseId, skuId])
  @@index([skuId])
}
```

## Relationship

```text
Warehouse (1) ─────────────< Inventory (N)
SKU       (1) ─────────────< Inventory (N)
Inventory (1) ─────────────< InventoryMovement (N)   // định nghĩa ở module Audit
```

## Note — các điểm quan trọng

1. **`quantityAvailable` không lưu cột riêng**, luôn tính runtime = `quantityOnHand - quantityReserved`. Vì mọi thao tác đọc/ghi số này đều nằm trong transaction đã `SELECT ... FOR UPDATE` trên chính row Inventory rồi, nên tính tại chỗ luôn đúng, tránh thêm 1 nguồn dữ liệu có thể lệch (stale) nếu code quên đồng bộ.

2. **`@@unique([warehouseId, skuId])` là bắt buộc**, không phải optional. Nếu thiếu, race condition lúc tạo Inventory lần đầu (2 request cùng insert đồng thời) có thể sinh ra 2 row cho cùng 1 cặp SKU/Warehouse — khi đó `FOR UPDATE` sẽ lock nhầm row, oversell vẫn xảy ra dù có locking.

3. **`version` tăng ở MỌI lần UPDATE vào Inventory**, không riêng gì flow Optimistic (Inventory Adjustment). Lý do: nếu chỉ tăng version ở Adjustment, kịch bản lost-update vẫn xảy ra — Admin đọc version=5 để sửa tay, cùng lúc Customer mua hàng qua flow pessimistic trừ kho nhưng không đụng version, Admin submit dựa data cũ với version=5 vẫn khớp → ghi đè mất luôn thay đổi từ giao dịch mua hàng.

4. **CHECK constraint ở tầng DB** (lưới an toàn cuối cùng, phòng bug ở code):
   - `quantityOnHand >= 0`
   - `quantityReserved >= 0`
   - `quantityReserved <= quantityOnHand`

   Prisma hỗ trợ CHECK constraint không đồng nhất giữa các version — an toàn nhất là thêm bằng raw SQL trong file migration (`ALTER TABLE ... ADD CONSTRAINT ... CHECK (...)`), không khai báo qua Prisma schema.

5. **Prisma không có attribute optimistic locking sẵn** (không có `@version`). Ở tầng service phải tự viết dạng:

```ts
const result = await prisma.inventory.updateMany({
  where: { id, version: currentVersion },
  data: { quantityOnHand: newQty, version: { increment: 1 } },
});
if (result.count === 0) throw new ConflictError(); // version lệch, retry
```

6. **Pessimistic locking (`SELECT ... FOR UPDATE`) không viết được qua Prisma Client query builder thông thường** — phải dùng `$queryRaw`/`$transaction` với raw SQL cho câu SELECT lock, ví dụ:

```ts
await prisma.$transaction(async (tx) => {
  const inv =
    await tx.$queryRaw`SELECT * FROM "Inventory" WHERE id = ${id} FOR UPDATE`;
  // check available, rồi update trong cùng transaction
});
```
7. **Buy Now hay Reservation đều chỉ trừ `reserved`, chỉ trừ `onHand` khi Outbound.**