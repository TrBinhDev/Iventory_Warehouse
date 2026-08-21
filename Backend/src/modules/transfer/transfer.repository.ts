import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma.js";

// Ép giờ VN thay vì giờ local của process — cùng code chạy ở container UTC hay máy dev đều ra 1 kết quả
const CODE_DATE_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Ho_Chi_Minh",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

// Sinh mã phiếu TRF-YYYYMMDD-XXXXXX từ sequence trong DB (nextval trả BIGINT, không phải number)
export async function nextTransferCode(tx: Prisma.TransactionClient): Promise<string> {
  const rows = await tx.$queryRaw<Array<{ value: bigint | string }>>`SELECT nextval('transfer_code_seq') AS value`;

  const seq = String(rows[0].value).padStart(6, "0");
  const datePart = CODE_DATE_FORMATTER.format(new Date()).replaceAll("-", "");

  return `TRF-${datePart}-${seq}`;
}

// Check kho tồn tại + còn hoạt động trước khi vào transaction — dùng chung cho cả nguồn lẫn đích
export function findWarehouseById(id: string) {
  return prisma.warehouse.findUnique({
    where: { id },
    select: { id: true, status: true },
  });
}

// Check SKU tồn tại trước khi tạo phiếu
export function findSkusForTransfer(skuIds: string[]) {
  return prisma.sKU.findMany({
    where: { id: { in: skuIds } },
    select: { id: true },
  });
}

// Tạo phiếu kèm toàn bộ dòng item trong 1 lệnh
export function createTransferWithItems(
  tx: Prisma.TransactionClient,
  data: {
    code: string;
    fromWarehouseId: string;
    toWarehouseId: string;
    createdByUserId: string;
    items: Array<{ skuId: string; quantityShipped: number }>;
  },
) {
  return tx.transfer.create({
    data: {
      code: data.code,
      fromWarehouseId: data.fromWarehouseId,
      toWarehouseId: data.toWarehouseId,
      createdByUserId: data.createdByUserId,
      items: { create: data.items },
    },
    include: {
      items: {
        select: {
          id: true,
          skuId: true,
          quantityShipped: true,
          sku: { select: { skuCode: true, product: { select: { name: true } } } },
        },
      },
    },
  });
}

// Lấy phiếu để kiểm quyền + trạng thái trước khi vào transaction
export function findTransferById(id: string) {
  return prisma.transfer.findUnique({
    where: { id },
    select: { id: true, fromWarehouseId: true, toWarehouseId: true, status: true },
  });
}

// Đổi trạng thái phiếu — status vừa là điều kiện vừa là khoá, dùng chung cho
// confirm/ship/receive/cancel. fromStatus phải là trạng thái ĐÃ ĐỌC ở trên, không phải
// danh sách — cùng lý do inbound/outbound/sales-order.
export function updateTransferStatus(
  tx: Prisma.TransactionClient,
  id: string,
  fromStatus: Prisma.TransferWhereInput["status"],
  data: Prisma.TransferUpdateManyMutationInput,
) {
  return tx.transfer.updateMany({ where: { id, status: fromStatus }, data });
}

// Lấy dòng hàng của phiếu để biết trừ/cộng bao nhiêu cho từng SKU lúc ship/receive
export function findTransferItems(tx: Prisma.TransactionClient, transferId: string) {
  return tx.transferItem.findMany({
    where: { transferId },
    select: { id: true, skuId: true, quantityShipped: true },
  });
}

// Ghi số thực nhận cho 1 dòng — định danh theo (transferId, skuId) vì items đã gộp duy nhất
// 1 dòng/SKU lúc tạo (xem note transfer.schema.ts)
export function updateTransferItemReceived(
  tx: Prisma.TransactionClient,
  transferId: string,
  skuId: string,
  quantityReceived: number,
) {
  return tx.transferItem.updateMany({
    where: { transferId, skuId },
    data: { quantityReceived },
  });
}

// Danh sách phiếu có phân trang. Sắp mới nhất trước vì đây là chứng từ, không phải danh mục.
export function findManyTransfers(where: Prisma.TransferWhereInput, skip: number, take: number) {
  return prisma.transfer.findMany({
    where,
    skip,
    take,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      code: true,
      status: true,
      createdAt: true,
      confirmedAt: true,
      shippedAt: true,
      receivedAt: true,
      fromWarehouse: { select: { id: true, code: true, name: true } },
      toWarehouse: { select: { id: true, code: true, name: true } },
      items: { select: { quantityShipped: true } },
    },
  });
}

// Đếm tổng số phiếu khớp filter — dùng cho meta phân trang
export function countTransfers(where: Prisma.TransferWhereInput) {
  return prisma.transfer.count({ where });
}

// Chi tiết 1 phiếu — join đủ để xem kỹ, chỉ 1 dòng nên không tiếc payload
export function findTransferDetail(id: string) {
  return prisma.transfer.findUnique({
    where: { id },
    select: {
      id: true,
      code: true,
      status: true,
      cancelReason: true,
      createdAt: true,
      updatedAt: true,
      confirmedAt: true,
      shippedAt: true,
      receivedAt: true,
      cancelledAt: true,
      fromWarehouseId: true,
      toWarehouseId: true,
      fromWarehouse: { select: { id: true, code: true, name: true, address: true } },
      toWarehouse: { select: { id: true, code: true, name: true, address: true } },
      createdBy: { select: { id: true, fullName: true } },
      items: {
        select: {
          id: true,
          skuId: true,
          quantityShipped: true,
          quantityReceived: true,
          note: true,
          sku: { select: { skuCode: true, product: { select: { name: true } } } },
        },
      },
    },
  });
}

// Timeline chuyển trạng thái — không có CUSTOMER trong module này nên không cần ẩn với ai
export function findTransferTimeline(id: string) {
  return prisma.documentStatusHistory.findMany({
    where: { documentType: "TRANSFER", documentId: id },
    orderBy: { createdAt: "asc" },
    select: {
      fromStatus: true,
      toStatus: true,
      note: true,
      createdAt: true,
      changedBy: { select: { id: true, fullName: true } },
    },
  });
}

// Lấy phiếu kèm item để trả về cho client sau khi đổi trạng thái
export function findTransferWithItems(tx: Prisma.TransactionClient, id: string) {
  return tx.transfer.findUnique({
    where: { id },
    include: {
      items: {
        select: {
          id: true,
          skuId: true,
          quantityShipped: true,
          quantityReceived: true,
          note: true,
          sku: { select: { skuCode: true, product: { select: { name: true } } } },
        },
      },
    },
  });
}
