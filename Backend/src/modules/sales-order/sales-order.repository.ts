import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma.js";

// Ép giờ VN thay vì giờ local của process — cùng code chạy ở container UTC hay máy dev đều ra 1 kết quả
const CODE_DATE_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Ho_Chi_Minh",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

// Sinh mã đơn SO-YYYYMMDD-XXXXXX từ sequence trong DB (nextval trả BIGINT, không phải number)
export async function nextSalesOrderCode(tx: Prisma.TransactionClient): Promise<string> {
  const rows = await tx.$queryRaw<Array<{ value: bigint | string }>>`SELECT nextval('sales_order_code_seq') AS value`;

  const seq = String(rows[0].value).padStart(6, "0");
  const datePart = CODE_DATE_FORMATTER.format(new Date()).replaceAll("-", "");

  return `SO-${datePart}-${seq}`;
}

// Check kho tồn tại + còn hoạt động trước khi vào transaction
export function findWarehouseById(id: string) {
  return prisma.warehouse.findUnique({
    where: { id },
    select: { id: true, status: true },
  });
}

// Lấy SKU kèm giá và trạng thái sản phẩm — giá dùng để snapshot vào unitPrice
export function findSkusForSalesOrder(skuIds: string[]) {
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

// Tạo đơn kèm toàn bộ dòng item trong 1 lệnh
export function createSalesOrderWithItems(
  tx: Prisma.TransactionClient,
  data: {
    code: string;
    warehouseId: string;
    customerId: string;
    reservationId: string | null;
    totalAmount: Prisma.Decimal;
    items: Array<{ skuId: string; quantity: number; unitPrice: Prisma.Decimal }>;
  },
) {
  return tx.salesOrder.create({
    data: {
      code: data.code,
      warehouseId: data.warehouseId,
      customerId: data.customerId,
      reservationId: data.reservationId,
      totalAmount: data.totalAmount,
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

// Lấy đơn để kiểm quyền + trạng thái trước khi vào transaction
export function findSalesOrderById(id: string) {
  return prisma.salesOrder.findUnique({
    where: { id },
    select: { id: true, customerId: true, warehouseId: true, status: true },
  });
}

// Đóng đơn (huỷ/hoàn tiền) — status vừa là điều kiện vừa là khoá.
// fromStatus phải là trạng thái ĐÃ ĐỌC ở trên, không phải danh sách: có vậy mới chắc
// trạng thái đích tính ra khớp với trạng thái thật lúc ghi (đơn PENDING bị người khác
// chuyển sang PAID xen giữa thì câu này trả 0 dòng chứ không âm thầm ghi nhầm CANCELLED).
export function markSalesOrderClosed(
  tx: Prisma.TransactionClient,
  id: string,
  fromStatus: Prisma.SalesOrderWhereInput["status"],
  data: Prisma.SalesOrderUpdateManyMutationInput,
) {
  return tx.salesOrder.updateMany({ where: { id, status: fromStatus }, data });
}

// Lấy dòng hàng của đơn để biết nhả bao nhiêu cho từng SKU
export function findSalesOrderItems(tx: Prisma.TransactionClient, salesOrderId: string) {
  return tx.salesOrderItem.findMany({
    where: { salesOrderId },
    select: { skuId: true, quantity: true },
  });
}

// Lấy đơn kèm item để trả về cho client sau khi đổi trạng thái
export function findSalesOrderWithItems(tx: Prisma.TransactionClient, id: string) {
  return tx.salesOrder.findUnique({
    where: { id },
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

// ---------------------------------------------------------------------------
// Đọc/ghi bảng của module reservation.
//
// Theo quy ước dự án: module nào cần đổi trạng thái chứng từ của module khác thì TỰ viết hàm
// trong module mình, không import chéo module. Chiều luôn là module sau ghi vào bảng module
// trước — reservation không biết sales-order tồn tại.
// ---------------------------------------------------------------------------

// Lấy phiếu để kiểm 404 + phạm vi trước khi vào transaction
export function findReservationForConvert(id: string) {
  return prisma.reservation.findUnique({
    where: { id },
    select: { id: true, customerId: true, warehouseId: true, status: true },
  });
}

// Lấy dòng hàng của phiếu KÈM unitPrice đã chốt lúc giữ chỗ — chép thẳng sang đơn,
// không đọc lại giá SKU hiện tại (giữ đúng giá đã hứa với khách trong 30 phút)
export function findReservationItems(tx: Prisma.TransactionClient, reservationId: string) {
  return tx.reservationItem.findMany({
    where: { reservationId },
    select: { skuId: true, quantity: true, unitPrice: true },
  });
}

// Đóng phiếu khi chuyển thành đơn — status vừa là điều kiện vừa là khoá.
// Trả count 0 nếu phiếu đã bị huỷ/hết hạn/đã chuyển bởi request khác.
export function confirmReservation(tx: Prisma.TransactionClient, id: string) {
  return tx.reservation.updateMany({
    where: { id, status: "PENDING" },
    data: { status: "CONFIRMED", confirmedAt: new Date() },
  });
}
