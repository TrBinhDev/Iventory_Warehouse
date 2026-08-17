## Master Data

```prisma
enum CategoryStatus {
  ACTIVE
  INACTIVE
}

model Category {
  id          String          @id @default(uuid()) @db.Uuid

  code        String          @unique @db.VarChar(50)

  name        String          @db.VarChar(255)

  status      CategoryStatus  @default(ACTIVE)

  products    ProductCategory[]

  createdAt   DateTime        @default(now())
  updatedAt   DateTime        @updatedAt

  @@index([status])
}

enum WarehouseStatus {
  ACTIVE
  INACTIVE
}

model Warehouse {
  id          String          @id @default(uuid()) @db.Uuid

  code        String          @unique @db.VarChar(50)

  name        String          @db.VarChar(255)

  address     String?

  // Chuẩn hoá lúc ghi bằng phoneSchema (utils/phone.util.ts) — xem mục "Tìm kiếm" cuối file
  phone       String?         @db.VarChar(20)

  status      WarehouseStatus @default(ACTIVE)

  users       User[]
  inventories Inventory[]

  createdAt   DateTime        @default(now())
  updatedAt   DateTime        @updatedAt

  @@index([status])
}

enum SupplierStatus {
  ACTIVE
  INACTIVE
}

model Supplier {
  id          String          @id @default(uuid()) @db.Uuid

  code        String          @unique @db.VarChar(50)

  name        String          @db.VarChar(255)

  contactName String?         @db.VarChar(255)

  // Chuẩn hoá lúc ghi bằng phoneSchema (utils/phone.util.ts)
  phone       String?         @db.VarChar(20)

  email       String?         @db.VarChar(255)

  address     String?

  taxCode     String?         @db.VarChar(50)

  status      SupplierStatus  @default(ACTIVE)

  inbounds    Inbound[]
  outbounds   Outbound[]

  createdAt   DateTime        @default(now())
  updatedAt   DateTime        @updatedAt

  @@index([status])
}

enum ProductStatus {
  ACTIVE
  INACTIVE
}

model Product {
  id          String          @id @default(uuid()) @db.Uuid

  code        String          @unique @db.VarChar(50)

  name        String          @db.VarChar(255)

  description String?

  unit        String          @db.VarChar(20)

  status      ProductStatus   @default(ACTIVE)

  images      String[]

  categories  ProductCategory[]
  skus        SKU[]

  createdAt   DateTime        @default(now())
  updatedAt   DateTime        @updatedAt

  @@index([status])
}

model ProductCategory {
  productId   String    @db.Uuid
  product     Product   @relation(fields: [productId], references: [id], onDelete: Cascade)

  categoryId  String    @db.Uuid
  category    Category  @relation(fields: [categoryId], references: [id], onDelete: Cascade)

  createdAt   DateTime  @default(now())

  @@id([productId, categoryId])
  @@index([categoryId])
}

enum SKUStatus {
  ACTIVE
  INACTIVE
}

model SKU {
  id          String          @id @default(uuid()) @db.Uuid

  productId   String          @db.Uuid
  product     Product         @relation(fields: [productId], references: [id])

  skuCode     String          @unique @db.VarChar(50)

  barcode     String?         @unique @db.VarChar(50)

  attributes  Json?

  price       Decimal         @db.Decimal(15, 2)

  cost        Decimal?        @db.Decimal(15, 2)

  weight      Decimal?        @db.Decimal(10, 3)

  status      SKUStatus       @default(ACTIVE)

  inventories       Inventory[]
  reservationItems  ReservationItem[]
  salesOrderItems   SalesOrderItem[]
  inboundItems      InboundItem[]
  outboundItems     OutboundItem[]
  transferItems     TransferItem[]
  adjustmentItems   InventoryAdjustmentItem[]

  createdAt   DateTime        @default(now())
  updatedAt   DateTime        @updatedAt

  @@index([productId])
  @@index([status])
}
```

## Relationship

```text
Category  (1) ─────────────< ProductCategory (N) >───────────── (1) Product   // n-n
Product   (1) ─────────────< SKU (N)
Warehouse (1) ─────────────< Inventory (N)   // định nghĩa ở module Inventory
Supplier  (1) ─────────────< Inbound (N)     // định nghĩa ở module Business
```

## Note

- `unit` là đơn vị tính cơ bản của Product (cái, hộp, kg...), lưu string tự do — không dùng enum vì danh sách đơn vị có thể mở rộng tùy ngành hàng.
- `attributes` trên SKU là JSONB (VD: `{ color: "red", size: "L" }`), không validate structure ở DB — validate ở tầng service trước khi ghi.
- `ProductCategory` là bảng trung gian n-n: 1 Product thuộc nhiều Category, 1 Category chứa nhiều Product. PK là cặp `@@id([productId, categoryId])`, không có `id` riêng. `onDelete: Cascade` để khi xóa Product/Category thì các dòng liên kết tự xóa theo (không để lại dòng mồ côi).
- `Warehouse.users`, `Warehouse.inventories`, `Supplier.inbounds`, `SKU.inventories` là forward reference tới model sẽ định nghĩa ở module sau.

## Tìm kiếm — ô `search` gộp

`GET /warehouses` và `GET /suppliers` đều nhận `search` — **một ô cho nhiều cột**, người dùng gõ gì cũng ra, không phải chọn trước đang tra bằng tên hay mã hay số điện thoại:

| Endpoint | Tìm trong |
|---|---|
| `GET /warehouses?search=` | `name`, `code`, `address`, `phone` |
| `GET /suppliers?search=` | `name`, `code`, `contactName`, `email`, `phone` |

Cùng khuôn với `GET /sales-orders?customer=` (tìm khách theo tên/email/sđt) — hai chỗ cùng kiểu thì dễ dùng hơn là mỗi chỗ một quy ước.

**Nhánh số điện thoại so bằng chuỗi ĐÃ CHUẨN HOÁ, không so nguyên văn.** Gõ `090 123 4567`, `+84901234567` hay `0901-234-567` đều khớp số lưu dạng `0901234567`. Gõ chữ thì `normalizePhone` trả rỗng nên nhánh đó **bị bỏ hẳn khỏi mệnh đề `OR`**, không ảnh hưởng kết quả tìm theo tên.

Điều đó chỉ đúng vì `phone` ở cả 3 bảng (`User`, `Supplier`, `Warehouse`) đều dùng `phoneSchema` (`utils/phone.util.ts`) **chuẩn hoá lúc ghi**. Trước đây khai `z.string().max(20)` — không regex, không chuẩn hoá, không cả `trim` — nên cùng một số máy lưu được dưới nhiều dạng và tra bằng `contains` thì gõ đúng số vẫn không ra. Đã đo trên `User`: 5 cách lưu × 6 cách gõ chỉ khớp **11/30 ô**.

Chuẩn hoá là **mất mát có chủ ý**: `(090) 123 4567` lưu thành `0901234567`, không khôi phục được định dạng gốc. Chấp nhận vì `phone` ở đây chỉ để liên lạc.

**Index**: 8 index GIN trigram (`Supplier` 5 cột, `Warehouse` 3 cột) — btree không dùng được cho `ILIKE '%...%'` khớp giữa chuỗi. Khai trong `schema.prisma` bằng `@@index([col(ops: raw("gin_trgm_ops"))], type: Gin)` chứ không tạo bằng raw SQL, nếu không mỗi lần `migrate diff` Prisma sẽ coi là lệch schema và sinh lệnh `DROP INDEX`.

⚠️ Index đã có sẵn để dùng khi dữ liệu lớn, nhưng **chưa đo được là nhanh hơn** — với vài chục dòng thì Postgres luôn chọn quét toàn bảng vì rẻ hơn.
