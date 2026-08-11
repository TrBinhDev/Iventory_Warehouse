# Inventory & Warehouse Management System

Hệ thống quản lý kho hàng đa chi nhánh, thiết kế xoay quanh một bài toán duy nhất: **giữ cho số liệu tồn kho luôn đúng khi hàng trăm request cùng đụng vào một SKU cùng lúc.**

<p align="left">
  <img src="https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=node.js&logoColor=white" alt="Node.js" />
  <img src="https://img.shields.io/badge/Express-000000?style=for-the-badge&logo=express&logoColor=white" alt="Express" />
  <img src="https://img.shields.io/badge/Prisma-2D3748?style=for-the-badge&logo=prisma&logoColor=white" alt="Prisma" />
  <img src="https://img.shields.io/badge/PostgreSQL-4169E1?style=for-the-badge&logo=postgresql&logoColor=white" alt="PostgreSQL" />
  <img src="https://img.shields.io/badge/Redis-DC382D?style=for-the-badge&logo=redis&logoColor=white" alt="Redis" />
  <img src="https://img.shields.io/badge/BullMQ-DD3333?style=for-the-badge&logo=redis&logoColor=white" alt="BullMQ" />
  <img src="https://img.shields.io/badge/JWT-000000?style=for-the-badge&logo=jsonwebtokens&logoColor=white" alt="JWT" />
  <img src="https://img.shields.io/badge/Resend-000000?style=for-the-badge&logo=resend&logoColor=white" alt="Resend" />
  <img src="https://img.shields.io/badge/Docker-2496ED?style=for-the-badge&logo=docker&logoColor=white" alt="Docker" />
  <img src="https://img.shields.io/badge/pnpm-F69220?style=for-the-badge&logo=pnpm&logoColor=white" alt="pnpm" />
</p>

---

## Bài toán

Một SKU trong một kho có đúng 1 hàng tồn (`onHand`) và 1 hàng đang giữ chỗ (`reserved`). Khi hai khách hàng cùng bấm mua chiếc cuối cùng, khi một nhân viên xuất kho đúng lúc admin đang kiểm kê, hay khi hai phiếu nhập cùng cộng dồn vào một dòng tồn kho — nếu không kiểm soát đúng, hệ thống sẽ:

- **Oversell** — bán vượt số lượng thực có
- **Over-reservation** — giữ chỗ nhiều hơn hàng tồn tại
- **Negative inventory** — tồn kho chạy âm do 2 transaction ghi đè lẫn nhau
- **Lost update** — thao tác quản trị (kiểm kê) vô tình xoá mất thay đổi từ một giao dịch mua hàng vừa xảy ra

Dự án này không phải là một CRUD app quản lý kho thông thường — nó là bài tập xử lý đúng 4 vấn đề trên bằng các cơ chế concurrency control ở tầng database, áp dụng cho một domain thực tế đủ phức tạp để các race condition đó thật sự xảy ra.

## Nghiệp vụ

| Nghiệp vụ | Actor | Mô tả |
|---|---|---|
| **Reservation** | Customer | Đặt trước hàng có thời hạn (TTL), tự nhả tồn kho khi hết hạn |
| **Buy Now / Sales Order** | Customer | Mua ngay, hoặc convert từ một Reservation đã `CONFIRMED` |
| **Inbound** | Staff/Manager | Nhập kho từ nhà cung cấp hoặc từ khách trả hàng |
| **Outbound** | Staff/Manager | Xuất kho giao hàng, trả nhà cung cấp, hoặc xuất do hư hỏng |
| **Transfer** | Staff/Manager | Chuyển hàng giữa 2 kho — 2 giai đoạn, 2 transaction độc lập (xuất kho nguồn → nhận kho đích) |
| **Inventory Adjustment** | Manager/Admin | Điều chỉnh tồn kho sau kiểm kê thực tế |

4 vai trò trong hệ thống: **Admin**, **Warehouse Manager**, **Warehouse Staff**, **Customer** — mỗi vai trò có phạm vi truy cập khác nhau, Manager/Staff bị giới hạn theo đúng kho mình thuộc (RBAC + ABAC).

## Chiến lược xử lý Concurrency

| Nghiệp vụ | Cơ chế | Vì sao |
|---|---|---|
| Reservation, Buy Now, Inbound, Outbound, Transfer | **Pessimistic Locking** (`SELECT ... FOR UPDATE`) + Transaction | Tần suất xung đột cao, ảnh hưởng trực tiếp tồn kho — khoá row ngay lúc đọc để chặn ghi chồng |
| Inventory Adjustment | **Optimistic Locking** (version field) + Transaction | Nghiệp vụ quản trị, tần suất xung đột thấp, không cần giữ khoá lâu — phát hiện Lost Update qua version mismatch |

Mọi thao tác thay đổi `Inventory` đều nằm trong **1 transaction Postgres duy nhất** cùng với việc ghi `InventoryMovement` (audit log) — rollback toàn bộ nếu bất kỳ bước nào thất bại, không bao giờ để số liệu ở trạng thái nửa vời. Các row bị `FOR UPDATE` luôn được `SELECT` theo thứ tự cố định (`ORDER BY skuId ASC`) để tránh deadlock giữa các transaction chạy song song.

## Tech Stack

| Layer | Công nghệ |
|---|---|
| Ngôn ngữ | TypeScript |
| Backend Framework | Express 5 |
| ORM | Prisma 7 (driver adapter `@prisma/adapter-pg`) |
| Database | PostgreSQL |
| Cache / Session / Queue | Redis (`ioredis`), BullMQ |
| Validation | Zod |
| Auth | JWT (access + refresh, rotation), `bcrypt`, session lưu Redis |
| Email | Resend (OTP xác thực email, link đặt lại mật khẩu) |
| Package Manager | pnpm (monorepo workspace) |
| Containerization | Docker Compose (Postgres + Redis) |

## Cấu trúc thư mục

```
Inventory_Warehouse/
├── Backend/                      # Express + Prisma API
│   ├── prisma/
│   │   ├── schema.prisma
│   │   └── migrations/
│   ├── src/
│   │   ├── modules/              # Feature-based: auth, user, category, warehouse,
│   │   │                         # supplier, product, inventory, reservation,
│   │   │                         # sales-order, inbound, outbound, transfer,
│   │   │                         # inventory-adjustment, inventory-movement
│   │   ├── middlewares/          # authenticate, authorize, validate, errorHandler...
│   │   ├── errors/                # AppError + các subclass theo HTTP status
│   │   ├── utils/                 # jwt, hash, session, mailer, response, asyncHandler
│   │   ├── constants/              # httpStatus, message, jwt, token
│   │   ├── config/                  # env, prisma, redis, logger
│   │   ├── app.ts                    # Express app + middleware pipeline
│   │   └── server.ts                  # Bootstrap: connect DB/Redis + listen
│   └── prisma.config.ts
├── Frontend/
│   ├── Client/                   # Ứng dụng khách hàng
│   └── Management/               # Ứng dụng quản trị kho
├── docker/
│   └── docker-compose.dev.yml    # Postgres + Redis cho local dev
├── docs/                         # Phân tích nghiệp vụ + thiết kế DB từng module, ERD.dbml
└── pnpm-workspace.yaml
```

Mỗi module trong `src/modules/<name>/` theo cùng 1 khuôn: `.controller.ts` (nhận request), `.service.ts` (business logic), `.repository.ts` (truy vấn Prisma), `.routes.ts` (khai báo route), `.schema.ts` (validate bằng Zod).

## Bắt đầu

### Yêu cầu

- Node.js ≥ 20
- pnpm ≥ 9
- Docker (chạy PostgreSQL + Redis)

### Cài đặt

```bash
pnpm install
```

### Cấu hình môi trường

Tạo file `Backend/.env`:

```dotenv
PORT=3000

DATABASE_URL="postgresql://postgres:<password>@localhost:5432/inventory_warehouse"
REDIS_URL="redis://:<password>@localhost:6379"

JWT_ACCESS_SECRET=
JWT_REFRESH_SECRET=
SECRET_KEY=

RESEND_API_KEY=
RESEND_FROM_EMAIL=
CLIENT_APP_URL=http://localhost:5173
```

Tạo file `docker/.env` với `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `REDIS_PASSWORD` tương ứng.

### Khởi động hạ tầng (PostgreSQL + Redis)

```bash
pnpm docker:up
```

### Sinh Prisma Client và migrate database

```bash
cd Backend
npx prisma generate
npx prisma migrate dev
```

### Chạy server

```bash
pnpm dev:be
```

Server chạy tại `http://localhost:3000`, kiểm tra kết nối qua `GET /health`.

## Tài liệu

Toàn bộ phân tích nghiệp vụ, thiết kế entity theo từng module, và lý do đằng sau các quyết định thiết kế (tại sao trường này nullable, tại sao dùng lock kiểu này...) nằm trong [`docs/`](./docs). Schema Prisma đầy đủ tại [`Backend/prisma/schema.prisma`](./Backend/prisma/schema.prisma), ERD dạng DBML sinh tự động qua `prisma-dbml-generator` tại [`docs/ERD.dbml`](./docs/ERD.dbml) — paste trực tiếp vào [dbdiagram.io](https://dbdiagram.io) để xem trực quan.

## License

ISC
