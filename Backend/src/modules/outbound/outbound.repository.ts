import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma.js";

// Ép giờ VN thay vì giờ local của process — cùng code chạy ở container UTC hay máy dev đều ra 1 kết quả
const CODE_DATE_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Ho_Chi_Minh",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

// Sinh mã phiếu OUT-YYYYMMDD-XXXXXX từ sequence trong DB (nextval trả BIGINT, không phải number)
export async function nextOutboundCode(tx: Prisma.TransactionClient): Promise<string> {
  const rows = await tx.$queryRaw<Array<{ value: bigint | string }>>`SELECT nextval('outbound_code_seq') AS value`;

  const seq = String(rows[0].value).padStart(6, "0");
  const datePart = CODE_DATE_FORMATTER.format(new Date()).replaceAll("-", "");

  return `OUT-${datePart}-${seq}`;
}

// Check kho tồn tại + còn hoạt động trước khi vào transaction
export function findWarehouseById(id: string) {
  return prisma.warehouse.findUnique({
    where: { id },
    select: { id: true, status: true },
  });
}

// Check nhà cung cấp tồn tại — chỉ dùng khi reason = RETURN_TO_SUPPLIER
export function findSupplierById(id: string) {
  return prisma.supplier.findUnique({
    where: { id },
    select: { id: true },
  });
}

// Lấy SKU để check tồn tại — chỉ dùng cho reason có items thủ công (không phải SALES_ORDER)
export function findSkusForOutbound(skuIds: string[]) {
  return prisma.sKU.findMany({
    where: { id: { in: skuIds } },
    select: { id: true },
  });
}

// ---------------------------------------------------------------------------
// Cross-module: outbound đọc/ghi bảng SalesOrder của module trước, viết hàm riêng
// trong module mình, không import chéo module — cùng quy ước sales-order đã theo
// với reservation.
// ---------------------------------------------------------------------------

// Check đơn tồn tại + lấy trạng thái trước khi vào transaction — chỉ dùng khi reason = SALES_ORDER
export function findSalesOrderForOutbound(id: string) {
  return prisma.salesOrder.findUnique({
    where: { id },
    select: { id: true, status: true, warehouseId: true },
  });
}

// Khoá dòng SalesOrder TRƯỚC khi khoá Inventory — thứ tự này bắt buộc khớp với
// cancelSalesOrder (SalesOrder trước, Inventory sau) để 2 giao dịch không ôm chéo lock.
// Chỉ SELECT, không đổi gì — dùng FOR UPDATE thuần vì lúc gọi hàm này còn chưa biết có
// cần đổi status hay không (create: chưa biết đơn có bị khoá bởi ai đó; ship: chưa tính
// xong đã xuất đủ đơn chưa).
export function lockSalesOrderRow(tx: Prisma.TransactionClient, id: string) {
  return tx.$queryRaw<Array<{ id: string; status: string }>>`
    SELECT id, status FROM "SalesOrder" WHERE id = ${id}::uuid FOR UPDATE
  `;
}

// Lấy dòng hàng của đơn để tự lấy items — chỉ dùng khi reason = SALES_ORDER, không đọc
// unitPrice vì Outbound không lưu giá
export function findSalesOrderItemsForOutbound(tx: Prisma.TransactionClient, salesOrderId: string) {
  return tx.salesOrderItem.findMany({
    where: { salesOrderId },
    select: { skuId: true, quantity: true },
  });
}

// 1 SalesOrder chỉ ứng với 1 phiếu Outbound còn hiệu lực (chưa CANCELLED) — check trong
// CÙNG transaction đã khoá SalesOrder ở trên, nên 2 request tạo đồng thời cho cùng đơn
// sẽ xếp hàng chờ nhau, không race.
export function findActiveOutboundBySalesOrderId(tx: Prisma.TransactionClient, salesOrderId: string) {
  return tx.outbound.findFirst({
    where: { salesOrderId, status: { not: "CANCELLED" } },
    select: { id: true },
  });
}

// Đổi SalesOrder CONFIRMED -> COMPLETED lúc ship xong — status vừa là điều kiện vừa là khoá,
// nhưng ở đây dòng đã bị khoá từ trước bởi lockSalesOrderRow trong CÙNG transaction nên
// count === 0 chỉ có thể xảy ra nếu logic gọi sai thứ tự (lập trình lỗi, không phải race).
export function completeSalesOrder(tx: Prisma.TransactionClient, id: string) {
  return tx.salesOrder.updateMany({
    where: { id, status: "CONFIRMED" },
    data: { status: "COMPLETED", completedAt: new Date() },
  });
}

// ---------------------------------------------------------------------------

// Tạo phiếu kèm toàn bộ dòng item trong 1 lệnh
export function createOutboundWithItems(
  tx: Prisma.TransactionClient,
  data: {
    code: string;
    warehouseId: string;
    reason: "SALES_ORDER" | "RETURN_TO_SUPPLIER" | "DAMAGED" | "OTHER";
    salesOrderId: string | null;
    supplierId: string | null;
    note: string | null;
    createdByUserId: string;
    items: Array<{ skuId: string; quantity: number }>;
  },
) {
  return tx.outbound.create({
    data: {
      code: data.code,
      warehouseId: data.warehouseId,
      reason: data.reason,
      salesOrderId: data.salesOrderId,
      supplierId: data.supplierId,
      note: data.note,
      createdByUserId: data.createdByUserId,
      items: { create: data.items },
    },
    include: {
      items: {
        select: {
          id: true,
          skuId: true,
          quantity: true,
          sku: { select: { skuCode: true, product: { select: { name: true } } } },
        },
      },
    },
  });
}

// Lấy phiếu để kiểm quyền + trạng thái trước khi vào transaction
export function findOutboundById(id: string) {
  return prisma.outbound.findUnique({
    where: { id },
    select: { id: true, warehouseId: true, status: true, reason: true, salesOrderId: true },
  });
}

// Đổi trạng thái phiếu — status vừa là điều kiện vừa là khoá, dùng chung cho confirm/ship/cancel.
// fromStatus phải là trạng thái ĐÃ ĐỌC ở trên, không phải danh sách — cùng lý do inbound/sales-order.
export function updateOutboundStatus(
  tx: Prisma.TransactionClient,
  id: string,
  fromStatus: Prisma.OutboundWhereInput["status"],
  data: Prisma.OutboundUpdateManyMutationInput,
) {
  return tx.outbound.updateMany({ where: { id, status: fromStatus }, data });
}

// Lấy dòng hàng của phiếu để biết trừ bao nhiêu cho từng SKU lúc ship
export function findOutboundItems(tx: Prisma.TransactionClient, outboundId: string) {
  return tx.outboundItem.findMany({
    where: { outboundId },
    select: { skuId: true, quantity: true },
  });
}

// Danh sách phiếu có phân trang. Sắp mới nhất trước vì đây là chứng từ, không phải danh mục.
export function findManyOutbounds(where: Prisma.OutboundWhereInput, skip: number, take: number) {
  return prisma.outbound.findMany({
    where,
    skip,
    take,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      code: true,
      status: true,
      reason: true,
      createdAt: true,
      confirmedAt: true,
      shippedAt: true,
      warehouse: { select: { id: true, code: true, name: true } },
      salesOrder: { select: { id: true, code: true } },
      supplier: { select: { id: true, code: true, name: true } },
      items: { select: { quantity: true } },
    },
  });
}

// Đếm tổng số phiếu khớp filter — dùng cho meta phân trang
export function countOutbounds(where: Prisma.OutboundWhereInput) {
  return prisma.outbound.count({ where });
}

// Chi tiết 1 phiếu — join đủ để xem kỹ, chỉ 1 dòng nên không tiếc payload
export function findOutboundDetail(id: string) {
  return prisma.outbound.findUnique({
    where: { id },
    select: {
      id: true,
      code: true,
      status: true,
      reason: true,
      note: true,
      cancelReason: true,
      createdAt: true,
      updatedAt: true,
      confirmedAt: true,
      shippedAt: true,
      cancelledAt: true,
      warehouseId: true,
      warehouse: { select: { id: true, code: true, name: true, address: true } },
      salesOrder: { select: { id: true, code: true } },
      supplier: { select: { id: true, code: true, name: true } },
      createdBy: { select: { id: true, fullName: true } },
      items: {
        select: {
          id: true,
          skuId: true,
          quantity: true,
          sku: { select: { skuCode: true, product: { select: { name: true } } } },
        },
      },
    },
  });
}

// Timeline chuyển trạng thái — không có CUSTOMER trong module này nên không cần ẩn với ai
export function findOutboundTimeline(id: string) {
  return prisma.documentStatusHistory.findMany({
    where: { documentType: "OUTBOUND", documentId: id },
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
export function findOutboundWithItems(tx: Prisma.TransactionClient, id: string) {
  return tx.outbound.findUnique({
    where: { id },
    include: {
      items: {
        select: {
          id: true,
          skuId: true,
          quantity: true,
          sku: { select: { skuCode: true, product: { select: { name: true } } } },
        },
      },
    },
  });
}
