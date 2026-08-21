import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma.js";

// Ép giờ VN thay vì giờ local của process — cùng code chạy ở container UTC hay máy dev đều ra 1 kết quả
const CODE_DATE_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Ho_Chi_Minh",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

// Sinh mã phiếu ADJ-YYYYMMDD-XXXXXX từ sequence trong DB (nextval trả BIGINT, không phải number)
export async function nextAdjustmentCode(tx: Prisma.TransactionClient): Promise<string> {
  const rows = await tx.$queryRaw<Array<{ value: bigint | string }>>`SELECT nextval('adjustment_code_seq') AS value`;

  const seq = String(rows[0].value).padStart(6, "0");
  const datePart = CODE_DATE_FORMATTER.format(new Date()).replaceAll("-", "");

  return `ADJ-${datePart}-${seq}`;
}

// Check kho tồn tại + còn hoạt động trước khi vào transaction
export function findWarehouseById(id: string) {
  return prisma.warehouse.findUnique({
    where: { id },
    select: { id: true, status: true },
  });
}

// Check SKU tồn tại trước khi tạo phiếu
export function findSkusForAdjustment(skuIds: string[]) {
  return prisma.sKU.findMany({
    where: { id: { in: skuIds } },
    select: { id: true },
  });
}

// Đọc snapshot Inventory hiện tại (KHÔNG khoá — chỉ đọc để lưu quantityBefore/expectedVersion
// lúc mở phiếu). Adjustment LUÔN đòi row có sẵn, không upsert — kiểm kê là sửa số đã khai báo,
// không phải khai báo mới.
export function findInventoryForAdjustment(warehouseId: string, skuIds: string[]) {
  return prisma.inventory.findMany({
    where: { warehouseId, skuId: { in: skuIds } },
    select: { skuId: true, quantityOnHand: true, version: true },
  });
}

// Tạo phiếu kèm toàn bộ dòng item trong 1 lệnh
export function createAdjustmentWithItems(
  tx: Prisma.TransactionClient,
  data: {
    code: string;
    warehouseId: string;
    reason: "STOCK_COUNT" | "DAMAGED" | "LOST" | "OTHER";
    note: string | null;
    createdByUserId: string;
    items: Array<{ skuId: string; quantityBefore: number; quantityAfter: number; expectedVersion: number }>;
  },
) {
  return tx.inventoryAdjustment.create({
    data: {
      code: data.code,
      warehouseId: data.warehouseId,
      reason: data.reason,
      note: data.note,
      createdByUserId: data.createdByUserId,
      items: { create: data.items },
    },
    include: {
      items: {
        select: {
          id: true,
          skuId: true,
          quantityBefore: true,
          quantityAfter: true,
          sku: { select: { skuCode: true, product: { select: { name: true } } } },
        },
      },
    },
  });
}

// Lấy phiếu để kiểm quyền + trạng thái trước khi vào transaction
export function findAdjustmentById(id: string) {
  return prisma.inventoryAdjustment.findUnique({
    where: { id },
    select: { id: true, warehouseId: true, status: true },
  });
}

// Đổi trạng thái phiếu DRAFT -> COMPLETED — status vừa là điều kiện vừa là khoá, cùng lý do
// các module trước. Chỉ 2 trạng thái nên chỉ cần đúng 1 hướng chuyển.
export function completeAdjustmentStatus(tx: Prisma.TransactionClient, id: string) {
  return tx.inventoryAdjustment.updateMany({
    where: { id, status: "DRAFT" },
    data: { status: "COMPLETED", completedAt: new Date() },
  });
}

// Lấy dòng hàng của phiếu để xử lý lúc complete
export function findAdjustmentItems(tx: Prisma.TransactionClient, adjustmentId: string) {
  return tx.inventoryAdjustmentItem.findMany({
    where: { adjustmentId },
    select: { skuId: true, quantityBefore: true, quantityAfter: true, expectedVersion: true },
  });
}

// Khoá OPTIMISTIC (KHÔNG FOR UPDATE) — gộp CẢ 2 điều kiện (version khớp, reserved không vượt
// quantityAfter) vào CHUNG 1 câu UPDATE để không có khoảng hở giữa đọc và ghi (bug đã dính ở
// transfer.shipTransfer nếu tách 2 bước). RETURNING kèm quantityReserved để dùng ghi
// InventoryMovement mà không cần đọc lại — reserved không đổi trong câu UPDATE này nên giá trị
// đó vừa là "trước" vừa là "sau" cho InventoryMovement.reservedBefore/reservedAfter.
export async function updateInventoryOptimistic(
  tx: Prisma.TransactionClient,
  warehouseId: string,
  skuId: string,
  expectedVersion: number,
  quantityAfter: number,
): Promise<{ id: string; quantityReserved: number } | null> {
  const rows = await tx.$queryRaw<Array<{ id: string; quantityReserved: number }>>`
    UPDATE "Inventory"
    SET "quantityOnHand" = ${quantityAfter}, version = version + 1, "updatedAt" = now()
    WHERE "warehouseId" = ${warehouseId}::uuid AND "skuId" = ${skuId}::uuid
      AND version = ${expectedVersion}
      AND "quantityReserved" <= ${quantityAfter}
    RETURNING id, "quantityReserved"
  `;
  return rows[0] ?? null;
}

// Đọc lại dòng tồn (không khoá) CHỈ để phân biệt lý do fail sau khi updateInventoryOptimistic
// trả null — version lệch hay reserved vượt. Không dùng để ra quyết định ghi gì.
export function findInventoryRow(warehouseId: string, skuId: string) {
  return prisma.inventory.findUnique({
    where: { warehouseId_skuId: { warehouseId, skuId } },
    select: { version: true, quantityReserved: true },
  });
}

// Danh sách phiếu có phân trang. Sắp mới nhất trước vì đây là chứng từ, không phải danh mục.
export function findManyAdjustments(where: Prisma.InventoryAdjustmentWhereInput, skip: number, take: number) {
  return prisma.inventoryAdjustment.findMany({
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
      completedAt: true,
      warehouse: { select: { id: true, code: true, name: true } },
      items: { select: { skuId: true } },
    },
  });
}

// Đếm tổng số phiếu khớp filter — dùng cho meta phân trang
export function countAdjustments(where: Prisma.InventoryAdjustmentWhereInput) {
  return prisma.inventoryAdjustment.count({ where });
}

// Chi tiết 1 phiếu — join đủ để xem kỹ, chỉ 1 dòng nên không tiếc payload
export function findAdjustmentDetail(id: string) {
  return prisma.inventoryAdjustment.findUnique({
    where: { id },
    select: {
      id: true,
      code: true,
      status: true,
      reason: true,
      note: true,
      createdAt: true,
      updatedAt: true,
      completedAt: true,
      warehouseId: true,
      warehouse: { select: { id: true, code: true, name: true, address: true } },
      createdBy: { select: { id: true, fullName: true } },
      items: {
        select: {
          id: true,
          skuId: true,
          quantityBefore: true,
          quantityAfter: true,
          sku: { select: { skuCode: true, product: { select: { name: true } } } },
        },
      },
    },
  });
}

// Timeline chuyển trạng thái — không có CUSTOMER trong module này nên không cần ẩn với ai
export function findAdjustmentTimeline(id: string) {
  return prisma.documentStatusHistory.findMany({
    where: { documentType: "INVENTORY_ADJUSTMENT", documentId: id },
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

// Lấy phiếu kèm item để trả về cho client sau khi complete
export function findAdjustmentWithItems(tx: Prisma.TransactionClient, id: string) {
  return tx.inventoryAdjustment.findUnique({
    where: { id },
    include: {
      items: {
        select: {
          id: true,
          skuId: true,
          quantityBefore: true,
          quantityAfter: true,
          sku: { select: { skuCode: true, product: { select: { name: true } } } },
        },
      },
    },
  });
}

// Xoá hẳn phiếu còn DRAFT — chưa từng đụng Inventory nên xoá sạch không để lại dấu vết nào
// cần giữ (không có InventoryMovement/DocumentStatusHistory nào tham chiếu lúc còn DRAFT).
//
// Khoá bằng SELECT ... FOR UPDATE trên chính dòng InventoryAdjustment TRƯỚC khi xoá — không
// phải để tránh ABBA (không có tài nguyên thứ 2 nào ở đây) mà để chặn race với `complete`:
// UPDATE (điều kiện status=DRAFT) trong completeAdjustmentStatus và SELECT FOR UPDATE ở đây
// cùng tranh 1 dòng, Postgres tự xếp hàng — bên thắng thấy trạng thái đã cam kết của bên kia,
// không có khoảng hở để xoá mất 1 phiếu vừa được complete thật (sẽ mất luôn InventoryItem gốc
// dùng để đối chiếu InventoryMovement vừa ghi — coi như phá audit trail của 1 lần đổi tồn kho
// đã áp dụng thật).
export async function deleteDraftAdjustment(id: string): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<Array<{ status: string }>>`
      SELECT status FROM "InventoryAdjustment" WHERE id = ${id}::uuid FOR UPDATE
    `;
    if (!locked[0] || locked[0].status !== "DRAFT") {
      return false;
    }

    await tx.inventoryAdjustmentItem.deleteMany({ where: { adjustmentId: id } });
    await tx.inventoryAdjustment.delete({ where: { id } });
    return true;
  });
}
