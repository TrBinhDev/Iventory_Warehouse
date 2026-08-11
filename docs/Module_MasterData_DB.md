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
