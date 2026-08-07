## Authentication 

```prisma
enum UserRole {
  ADMIN
  WAREHOUSE_MANAGER
  WAREHOUSE_STAFF
  CUSTOMER
}

enum UserStatus {
  ACTIVE
  INACTIVE
  BLOCKED
}

model User {
  id                String      @id @default(uuid()) @db.Uuid

  role              UserRole

  warehouseId       String?     @db.Uuid
  warehouse         Warehouse?  @relation(fields: [warehouseId], references: [id])

  fullName          String      @db.VarChar(255)

  email             String      @unique @db.VarChar(255)

  passwordHash      String

  isEmailVerified   Boolean     @default(false)

  phone             String?     @db.VarChar(20)

  avatarUrl         String?

  status            UserStatus  @default(ACTIVE)

  lastLoginAt       DateTime?

  createdAt         DateTime    @default(now())
  updatedAt         DateTime    @updatedAt

  @@index([role])
  @@index([status])
  @@index([warehouseId])
}
```

## Relationship

```text
Warehouse (1) ─────────────< User (N)
```

## Note

- Refresh token, email verification token, reset password token → lưu Redis (có TTL), không lưu SQL.
- Validate ở service layer: nếu `role` là `WAREHOUSE_MANAGER` hoặc `WAREHOUSE_STAFF` thì `warehouseId` bắt buộc; nếu `ADMIN` hoặc `CUSTOMER` thì `warehouseId` phải `null`.
