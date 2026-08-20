import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma.js";

// Ép giờ VN thay vì giờ local của process — cùng code chạy ở container UTC hay máy dev đều ra 1 kết quả
const CODE_DATE_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Ho_Chi_Minh",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

// Sinh mã phiếu IN-YYYYMMDD-XXXXXX từ sequence trong DB (nextval trả BIGINT, không phải number)
export async function nextInboundCode(tx: Prisma.TransactionClient): Promise<string> {
  const rows = await tx.$queryRaw<Array<{ value: bigint | string }>>`SELECT nextval('inbound_code_seq') AS value`;

  const seq = String(rows[0].value).padStart(6, "0");
  const datePart = CODE_DATE_FORMATTER.format(new Date()).replaceAll("-", "");

  return `IN-${datePart}-${seq}`;
}

// Check kho tồn tại + còn hoạt động trước khi vào transaction
export function findWarehouseById(id: string) {
  return prisma.warehouse.findUnique({
    where: { id },
    select: { id: true, status: true },
  });
}

// Check nhà cung cấp tồn tại — chỉ dùng khi reason = FROM_SUPPLIER
export function findSupplierById(id: string) {
  return prisma.supplier.findUnique({
    where: { id },
    select: { id: true },
  });
}

// Check đơn hàng tồn tại — chỉ dùng khi reason = CUSTOMER_RETURN. Lấy kèm status vì chỉ đơn
// đã giao hoàn thành (COMPLETED) mới được trả hàng.
export function findSalesOrderById(id: string) {
  return prisma.salesOrder.findUnique({
    where: { id },
    select: { id: true, status: true },
  });
}

// Lấy SKU để check tồn tại trước khi tạo phiếu — inbound không cần giá/trạng thái ACTIVE
// như sales-order (nhập hàng không bị chặn bởi SKU ngừng bán)
export function findSkusForInbound(skuIds: string[]) {
  return prisma.sKU.findMany({
    where: { id: { in: skuIds } },
    select: { id: true },
  });
}

// Tạo phiếu kèm toàn bộ dòng item trong 1 lệnh
export function createInboundWithItems(
  tx: Prisma.TransactionClient,
  data: {
    code: string;
    warehouseId: string;
    reason: "FROM_SUPPLIER" | "CUSTOMER_RETURN";
    supplierId: string | null;
    salesOrderId: string | null;
    createdByUserId: string;
    items: Array<{
      skuId: string;
      quantityOrdered: number;
      unitCost: Prisma.Decimal | string;
      note: string | null;
    }>;
  },
) {
  return tx.inbound.create({
    data: {
      code: data.code,
      warehouseId: data.warehouseId,
      reason: data.reason,
      supplierId: data.supplierId,
      salesOrderId: data.salesOrderId,
      createdByUserId: data.createdByUserId,
      items: { create: data.items },
    },
    include: {
      items: {
        select: {
          id: true,
          skuId: true,
          quantityOrdered: true,
          unitCost: true,
          note: true,
          sku: { select: { skuCode: true, product: { select: { name: true } } } },
        },
      },
    },
  });
}

// Lấy phiếu để kiểm quyền + trạng thái trước khi vào transaction
export function findInboundById(id: string) {
  return prisma.inbound.findUnique({
    where: { id },
    select: { id: true, warehouseId: true, status: true, createdByUserId: true },
  });
}

// Đổi trạng thái phiếu — status vừa là điều kiện vừa là khoá, dùng chung cho confirm/receive/cancel.
// fromStatus phải là trạng thái ĐÃ ĐỌC ở trên, không phải danh sách — cùng lý do với sales-order:
// 0 dòng nghĩa là người khác đã đổi trạng thái trước, không được ghi đè.
export function updateInboundStatus(
  tx: Prisma.TransactionClient,
  id: string,
  fromStatus: Prisma.InboundWhereInput["status"],
  data: Prisma.InboundUpdateManyMutationInput,
) {
  return tx.inbound.updateMany({ where: { id, status: fromStatus }, data });
}

// Lấy dòng hàng của phiếu để biết cộng bao nhiêu cho từng SKU lúc receive
export function findInboundItems(tx: Prisma.TransactionClient, inboundId: string) {
  return tx.inboundItem.findMany({
    where: { inboundId },
    select: { id: true, skuId: true, quantityOrdered: true },
  });
}

// Ghi số thực nhận cho từng dòng — bulk update từng item theo id
export function updateInboundItemReceived(
  tx: Prisma.TransactionClient,
  itemId: string,
  quantityReceived: number,
) {
  return tx.inboundItem.update({
    where: { id: itemId },
    data: { quantityReceived },
  });
}

// Danh sách phiếu có phân trang. Sắp mới nhất trước vì đây là chứng từ, không phải danh mục.
export function findManyInbounds(where: Prisma.InboundWhereInput, skip: number, take: number) {
  return prisma.inbound.findMany({
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
      receivedAt: true,
      warehouse: { select: { id: true, code: true, name: true } },
      supplier: { select: { id: true, code: true, name: true } },
      items: { select: { quantityOrdered: true } },
    },
  });
}

// Đếm tổng số phiếu khớp filter — dùng cho meta phân trang
export function countInbounds(where: Prisma.InboundWhereInput) {
  return prisma.inbound.count({ where });
}

// Chi tiết 1 phiếu — join đủ để xem kỹ, chỉ 1 dòng nên không tiếc payload
export function findInboundDetail(id: string) {
  return prisma.inbound.findUnique({
    where: { id },
    select: {
      id: true,
      code: true,
      status: true,
      reason: true,
      cancelReason: true,
      createdAt: true,
      updatedAt: true,
      confirmedAt: true,
      receivedAt: true,
      cancelledAt: true,
      warehouseId: true,
      warehouse: { select: { id: true, code: true, name: true, address: true } },
      supplier: { select: { id: true, code: true, name: true } },
      salesOrder: { select: { id: true, code: true } },
      createdBy: { select: { id: true, fullName: true } },
      items: {
        select: {
          id: true,
          skuId: true,
          quantityOrdered: true,
          quantityReceived: true,
          unitCost: true,
          note: true,
          sku: { select: { skuCode: true, product: { select: { name: true } } } },
        },
      },
    },
  });
}

// Timeline chuyển trạng thái — không có CUSTOMER trong module này nên không cần ẩn với ai
export function findInboundTimeline(id: string) {
  return prisma.documentStatusHistory.findMany({
    where: { documentType: "INBOUND", documentId: id },
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
export function findInboundWithItems(tx: Prisma.TransactionClient, id: string) {
  return tx.inbound.findUnique({
    where: { id },
    include: {
      items: {
        select: {
          id: true,
          skuId: true,
          quantityOrdered: true,
          quantityReceived: true,
          unitCost: true,
          note: true,
          sku: { select: { skuCode: true, product: { select: { name: true } } } },
        },
      },
    },
  });
}
