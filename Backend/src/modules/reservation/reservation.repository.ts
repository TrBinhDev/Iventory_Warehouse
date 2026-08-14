import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma.js";

// QueryRaw không có type tự sinh nên khai tay
export interface LockedInventoryRow {
  id: string;
  skuId: string;
  quantityOnHand: number;
  quantityReserved: number;
}

// Khóa các dòng tồn của phiếu ORDER BY trước FOR UPDATE để mọi transaction khóa cùng thứ tự tránh deadlock
export function lockInventories(
  tx: Prisma.TransactionClient,
  warehouseId: string,
  skuIds: string[],
) {
  return tx.$queryRaw<LockedInventoryRow[]>`
    SELECT id, "skuId", "quantityOnHand", "quantityReserved"
    FROM "Inventory"
    WHERE "warehouseId" = ${warehouseId}::uuid AND "skuId" IN (${Prisma.join(skuIds)})
    ORDER BY "skuId"
    FOR UPDATE
  `;
}

// Ép giờ VN thay vì giờ local của process — cùng code chạy ở container UTC hay máy dev đều ra 1 kết quả
const CODE_DATE_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Ho_Chi_Minh",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

// Sinh mã phiếu RES-YYYYMMDD-XXXX từ sequence trong DB (nextval trả BIGINT, không phải number)
export async function nextReservationCode(tx: Prisma.TransactionClient): Promise<string> {
  const rows = await tx.$queryRaw<Array<{ value: bigint | string }>>`SELECT nextval('reservation_code_seq') AS value`;

  const seq = String(rows[0].value).padStart(6, "0");
  const datePart = CODE_DATE_FORMATTER.format(new Date()).replaceAll("-", "");

  return `RES-${datePart}-${seq}`;
}

// Check kho tồn tại + còn hoạt động trước khi vào transaction
export function findWarehouseById(id: string) {
  return prisma.warehouse.findUnique({
    where: { id },
    select: { id: true, status: true },
  });
}

// Lấy SKU kèm giá và trạng thái sản phẩm — giá dùng để snapshot vào unitPrice
export function findSkusForReservation(skuIds: string[]) {
  return prisma.sKU.findMany({
    where: { id: { in: skuIds } },
    select: {
      id: true,
      price: true,
      status: true,
      product: { select: { status: true } },
    },
  });
}

// Tăng số đang giữ của 1 dòng tồn — không đụng quantityOnHand
export function increaseReserved(
  tx: Prisma.TransactionClient,
  inventoryId: string,
  quantity: number,
) {
  return tx.inventory.update({
    where: { id: inventoryId },
    data: {
      quantityReserved: { increment: quantity },
      version: { increment: 1 },
    },
  });
}

// Tạo phiếu kèm toàn bộ dòng item trong 1 lệnh
export function createReservationWithItems(
  tx: Prisma.TransactionClient,
  data: {
    code: string;
    warehouseId: string;
    customerId: string;
    expiresAt: Date;
    items: Array<{ skuId: string; quantity: number; unitPrice: Prisma.Decimal }>;
  },
) {
  return tx.reservation.create({
    data: {
      code: data.code,
      warehouseId: data.warehouseId,
      customerId: data.customerId,
      expiresAt: data.expiresAt,
      items: { create: data.items },
    },
    include: {
      items: {
        select: {
          id: true,
          skuId: true,
          quantity: true,
          unitPrice: true,
          sku: {
            select: { skuCode: true, product: { select: { name: true } } },
          },
        },
      },
    },
  });
}

// Ghi audit log biến động tồn — 1 row cho 1 SKU, cùng transaction với thao tác đổi Inventory
export function createMovements(
  tx: Prisma.TransactionClient,
  data: Prisma.InventoryMovementCreateManyInput[],
) {
  return tx.inventoryMovement.createMany({ data });
}

// Lấy phiếu để kiểm quyền + trạng thái trước khi vào transaction
export function findReservationById(id: string) {
  return prisma.reservation.findUnique({
    where: { id },
    select: { id: true, customerId: true, warehouseId: true, status: true },
  });
}

// Đóng phiếu (huỷ/hết hạn) — status vừa là điều kiện vừa là khoá, trả count 0 nếu ai đó đã xử lý trước
export function markReservationClosed(
  tx: Prisma.TransactionClient,
  id: string,
  // Unchecked để gán thẳng cancelledByUserId — updateMany không nhận cú pháp connect quan hệ
  data: Prisma.ReservationUncheckedUpdateManyInput,
) {
  return tx.reservation.updateMany({
    where: { id, status: "PENDING" },
    data,
  });
}

// Lấy dòng item của phiếu để biết nhả bao nhiêu cho từng SKU
export function findItemsByReservationId(
  tx: Prisma.TransactionClient,
  reservationId: string,
) {
  return tx.reservationItem.findMany({
    where: { reservationId },
    select: { skuId: true, quantity: true },
  });
}

// Tìm phiếu đã quá hạn mà chưa được nhả — cho job quét dự phòng, giới hạn số lượng mỗi lượt
export function findExpiredPendingIds(limit: number) {
  return prisma.reservation.findMany({
    where: { status: "PENDING", expiresAt: { lt: new Date() } },
    select: { id: true },
    orderBy: { expiresAt: "asc" },
    take: limit,
  });
}

// Giảm số đang giữ — CHECK constraint reserved >= 0 dưới DB là lưới đỡ nếu logic sai
export function decreaseReserved(
  tx: Prisma.TransactionClient,
  inventoryId: string,
  quantity: number,
) {
  return tx.inventory.update({
    where: { id: inventoryId },
    data: {
      quantityReserved: { decrement: quantity },
      version: { increment: 1 },
    },
  });
}

// Danh sách phiếu có phân trang. Kéo items chỉ 2 cột số để service cộng tổng SL/tổng tiền —
// không join sang SKU/Product nên vẫn nhẹ. Sắp mới nhất trước vì đây là chứng từ, không phải danh mục.
export function findManyReservations(
  where: Prisma.ReservationWhereInput,
  skip: number,
  take: number,
) {
  return prisma.reservation.findMany({
    where,
    skip,
    take,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      code: true,
      status: true,
      expiresAt: true,
      createdAt: true,
      warehouse: { select: { id: true, code: true, name: true } },
      customer: { select: { id: true, fullName: true } },
      items: { select: { quantity: true, unitPrice: true } },
    },
  });
}

// Đếm tổng số phiếu khớp filter — dùng cho meta phân trang
export function countReservations(where: Prisma.ReservationWhereInput) {
  return prisma.reservation.count({ where });
}

// Chi tiết 1 phiếu — join đủ để xem kỹ, chỉ 1 dòng nên không tiếc payload
export function findReservationDetail(id: string) {
  return prisma.reservation.findUnique({
    where: { id },
    select: {
      id: true,
      code: true,
      status: true,
      expiresAt: true,
      createdAt: true,
      updatedAt: true,
      confirmedAt: true,
      cancelledAt: true,
      expiredAt: true,
      cancelReason: true,
      warehouseId: true,
      customerId: true,
      warehouse: { select: { id: true, code: true, name: true, address: true } },
      customer: { select: { id: true, fullName: true, email: true, phone: true } },
      cancelledBy: { select: { id: true, fullName: true } },
      items: {
        select: {
          id: true,
          skuId: true,
          quantity: true,
          unitPrice: true,
          sku: {
            select: {
              skuCode: true,
              barcode: true,
              product: { select: { id: true, name: true, unit: true } },
            },
          },
        },
      },
    },
  });
}

// Lấy phiếu kèm item để trả về cho client sau khi đổi trạng thái
export function findReservationWithItems(tx: Prisma.TransactionClient, id: string) {
  return tx.reservation.findUnique({
    where: { id },
    include: {
      cancelledBy: { select: { id: true, fullName: true } },
      items: {
        select: {
          id: true,
          skuId: true,
          quantity: true,
          unitPrice: true,
          sku: {
            select: { skuCode: true, product: { select: { name: true } } },
          },
        },
      },
    },
  });
}