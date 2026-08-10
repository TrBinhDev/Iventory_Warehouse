# Inventory & Warehouse Management System

Hệ thống quản lý kho hàng đa chi nhánh (multi-warehouse), tập trung giải quyết bài toán **race condition** trong các nghiệp vụ kho vận: chống overselling, chống over-reservation, và đảm bảo tồn kho không bao giờ âm khi nhiều người dùng thao tác đồng thời trên cùng một SKU.

<p align="left">
  <img src="https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=node.js&logoColor=white" alt="Node.js" />
  <img src="https://img.shields.io/badge/Express-000000?style=for-the-badge&logo=express&logoColor=white" alt="Express" />
  <img src="https://img.shields.io/badge/Prisma-2D3748?style=for-the-badge&logo=prisma&logoColor=white" alt="Prisma" />
  <img src="https://img.shields.io/badge/PostgreSQL-4169E1?style=for-the-badge&logo=postgresql&logoColor=white" alt="PostgreSQL" />
  <img src="https://img.shields.io/badge/Redis-DC382D?style=for-the-badge&logo=redis&logoColor=white" alt="Redis" />
  <img src="https://img.shields.io/badge/BullMQ-DD3333?style=for-the-badge&logo=redis&logoColor=white" alt="BullMQ" />
  <img src="https://img.shields.io/badge/Docker-2496ED?style=for-the-badge&logo=docker&logoColor=white" alt="Docker" />
  <img src="https://img.shields.io/badge/pnpm-F69220?style=for-the-badge&logo=pnpm&logoColor=white" alt="pnpm" />
</p>

---

## Tổng quan

Dự án mô phỏng một hệ thống quản lý kho vận thực tế với đầy đủ nghiệp vụ: đặt trước hàng hóa (Reservation), mua ngay (Buy Now), nhập kho, xuất kho, chuyển kho giữa các chi nhánh, và điều chỉnh tồn kho sau kiểm kê. Trọng tâm kỹ thuật là xử lý đúng đắn các tình huống concurrency phổ biến trong hệ thống thương mại điện tử / kho vận.

## Tính năng chính

- **Quản lý đa kho** — nhiều Warehouse, mỗi kho quản lý tồn kho độc lập theo từng SKU
- **Reservation** — đặt trước hàng hóa có thời hạn (TTL), tự động nhả tồn kho khi hết hạn qua BullMQ delayed job
- **Buy Now / Sales Order** — mua hàng trực tiếp hoặc chuyển đổi từ Reservation đã xác nhận
- **Inbound / Outbound** — nhập kho từ nhà cung cấp hoặc khách trả hàng, xuất kho giao hàng hoặc trả nhà cung cấp
- **Transfer** — chuyển hàng giữa các kho theo 2 giai đoạn (xuất kho nguồn → nhận kho đích), có ghi nhận thất thoát
- **Inventory Adjustment** — điều chỉnh tồn kho sau kiểm kê thực tế, dùng Optimistic Locking
- **Audit Log** — ghi lại toàn bộ biến động tồn kho (`InventoryMovement`) phục vụ truy vết

## Chiến lược xử lý Concurrency

| Nghiệp vụ                                         | Cơ chế                                                      | Lý do                                                                         |
| ------------------------------------------------- | ----------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Reservation, Buy Now, Inbound, Outbound, Transfer | Pessimistic Locking (`SELECT ... FOR UPDATE`) + Transaction | Tần suất xung đột cao, ảnh hưởng trực tiếp tồn kho, cần khóa row ngay lúc đọc |
| Inventory Adjustment                              | Optimistic Locking (version field) + Transaction            | Tần suất thấp, nghiệp vụ quản trị, không cần giữ khóa lâu                     |

Toàn bộ giao dịch thay đổi tồn kho đều nằm trong 1 transaction Postgres duy nhất, đảm bảo rollback toàn bộ nếu có bước nào thất bại — không để dữ liệu ở trạng thái nửa vời.

## Tech Stack

| Layer             | Công nghệ                                        |
| ----------------- | ------------------------------------------------ |
| Ngôn ngữ          | TypeScript                                       |
| Backend Framework | Express                                          |
| ORM               | Prisma (v7, driver adapter `@prisma/adapter-pg`) |
| Database          | PostgreSQL                                       |
| Cache / Queue     | Redis, BullMQ                                    |
| Validation        | Zod                                              |
| Auth              | JWT (access + refresh token)                     |
| Package Manager   | pnpm (monorepo workspace)                        |
| Containerization  | Docker Compose                                   |

## Cấu trúc thư mục

```
Inventory_Warehouse/
├── Backend/                 # Express + Prisma API
│   ├── prisma/
│   │   └── schema.prisma
│   ├── src/
│   │   ├── modules/          # Feature-based: auth, inventory, reservation...
│   │   ├── shared/            # middlewares, errors, utils dùng chung
│   │   ├── config/            # env, prisma, redis, queue
│   │   ├── jobs/               # BullMQ job handlers
│   │   └── server.ts
│   └── prisma.config.ts
├── Frontend/
│   ├── Client/                # Ứng dụng khách hàng
│   └── Management/            # Ứng dụng quản trị kho
├── docker/
│   └── docker-compose.dev.yml
├── docs/
│   └── ERD.dbml               # Sinh tự động từ Prisma schema
└── pnpm-workspace.yaml
```

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

Tạo file `Backend/.env` theo mẫu:

```dotenv
PORT=3000

DATABASE_URL="postgresql://postgres:<password>@localhost:5432/inventory_warehouse"
REDIS_URL="redis://:<password>@localhost:6379"

JWT_ACCESS_SECRET=
JWT_REFRESH_SECRET=
SECRET_KEY=
```

### Khởi động hạ tầng (PostgreSQL + Redis)

```bash
pnpm docker:up
```

### Sinh Prisma Client và migrate database

```bash
cd Backend
npx prisma generate
npx prisma migrate dev --name init
```

### Chạy server

```bash
pnpm dev:be
```

Server chạy tại `http://localhost:3000`, kiểm tra kết nối qua route `GET /health`.

## ERD

Schema đầy đủ được định nghĩa tại `Backend/prisma/schema.prisma`. File `docs/ERD.dbml` được sinh tự động mỗi lần chạy `prisma generate`, có thể paste trực tiếp vào [dbdiagram.io](https://dbdiagram.io) để xem dạng trực quan.

## License

ISC
