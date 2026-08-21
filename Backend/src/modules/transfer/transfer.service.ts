import type { Prisma, UserRole } from "@prisma/client";
import { prisma } from "../../config/prisma.js";
import { Message } from "../../constants/message.js";
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from "../../errors/appError.js";
import { applyInventoryDeltas, ensureInventoryRows, lockInventoryRows } from "../../utils/inventory.core.js";
import { recordStatusChange } from "../../utils/status.core.js";
import * as transferRepository from "./transfer.repository.js";
import type {
  CancelTransferInput,
  CreateTransferInput,
  ListTransfersQuery,
  ReceiveTransferInput,
} from "./transfer.schema.js";

interface Actor {
  id: string;
  role: UserRole;
  warehouseId: string | null;
}

// Xem danh sách/chi tiết: thấy được nếu là kho NGUỒN hoặc kho ĐÍCH — cả 2 bên đều liên quan
function assertViewScope(actor: Actor, transfer: { fromWarehouseId: string; toWarehouseId: string }): void {
  if (actor.role === "ADMIN") return;
  if (actor.warehouseId !== transfer.fromWarehouseId && actor.warehouseId !== transfer.toWarehouseId) {
    throw new NotFoundError(Message.TRANSFER.NOT_FOUND.message, Message.TRANSFER.NOT_FOUND.code);
  }
}

// Tạo/duyệt/xuất/huỷ: chỉ kho NGUỒN — người quyết định chuyển hàng đi
function assertSourceScope(actor: Actor, transfer: { fromWarehouseId: string }): void {
  if (actor.role === "ADMIN") return;
  if (actor.warehouseId !== transfer.fromWarehouseId) {
    throw new NotFoundError(Message.TRANSFER.NOT_FOUND.message, Message.TRANSFER.NOT_FOUND.code);
  }
}

// Nhận hàng: chỉ kho ĐÍCH — người đứng tại kho B mới xác nhận được đã nhận
function assertDestScope(actor: Actor, transfer: { toWarehouseId: string }): void {
  if (actor.role === "ADMIN") return;
  if (actor.warehouseId !== transfer.toWarehouseId) {
    throw new NotFoundError(Message.TRANSFER.NOT_FOUND.message, Message.TRANSFER.NOT_FOUND.code);
  }
}

const CANCELLABLE_STATUS: Record<UserRole, readonly string[]> = {
  WAREHOUSE_STAFF: ["DRAFT"],
  WAREHOUSE_MANAGER: ["DRAFT", "CONFIRMED"],
  ADMIN: ["DRAFT", "CONFIRMED"],
  CUSTOMER: [],
};

// Gộp dòng trùng skuId (hạ chữ thường vì UUID nhận cả chữ hoa) — TransferItem không có giá
// riêng từng dòng nên 2 dòng trùng SKU không mang thông tin gì khác biệt, cùng lý do outbound.
function mergeItems(items: Array<{ skuId: string; quantity: number }>) {
  const merged = new Map<string, number>();
  for (const item of items) {
    const skuId = item.skuId.toLowerCase();
    merged.set(skuId, (merged.get(skuId) ?? 0) + item.quantity);
  }
  return [...merged.entries()].map(([skuId, quantity]) => ({ skuId, quantity }));
}

// Tạo phiếu chuyển kho (DRAFT) — chưa đụng Inventory. ABAC ép đúng kho nguồn.
export async function createTransfer(actor: Actor, input: CreateTransferInput) {
  if (input.fromWarehouseId === input.toWarehouseId) {
    throw new BadRequestError(Message.TRANSFER.SAME_WAREHOUSE.message, Message.TRANSFER.SAME_WAREHOUSE.code);
  }

  if (actor.role !== "ADMIN" && input.fromWarehouseId !== actor.warehouseId) {
    throw new ForbiddenError(
      Message.TRANSFER.FORBIDDEN_WAREHOUSE.message,
      Message.TRANSFER.FORBIDDEN_WAREHOUSE.code,
    );
  }

  const [fromWarehouse, toWarehouse] = await Promise.all([
    transferRepository.findWarehouseById(input.fromWarehouseId),
    transferRepository.findWarehouseById(input.toWarehouseId),
  ]);
  if (!fromWarehouse || fromWarehouse.status !== "ACTIVE" || !toWarehouse || toWarehouse.status !== "ACTIVE") {
    throw new NotFoundError(
      Message.TRANSFER.WAREHOUSE_NOT_FOUND.message,
      Message.TRANSFER.WAREHOUSE_NOT_FOUND.code,
    );
  }

  const items = mergeItems(input.items);
  const skuIds = items.map((item) => item.skuId);
  const skus = await transferRepository.findSkusForTransfer(skuIds);
  if (skus.length !== skuIds.length) {
    const found = new Set(skus.map((sku) => sku.id));
    throw new NotFoundError(
      Message.TRANSFER.SKU_NOT_FOUND.message,
      Message.TRANSFER.SKU_NOT_FOUND.code,
      skuIds.filter((skuId) => !found.has(skuId)),
    );
  }

  return prisma.$transaction(async (tx) => {
    const code = await transferRepository.nextTransferCode(tx);

    return transferRepository.createTransferWithItems(tx, {
      code,
      fromWarehouseId: input.fromWarehouseId,
      toWarehouseId: input.toWarehouseId,
      createdByUserId: actor.id,
      items: items.map((item) => ({ skuId: item.skuId, quantityShipped: item.quantity })),
    });
  });
}

// Danh sách phiếu có phân trang — Manager/Staff thấy phiếu mà kho mình là NGUỒN hoặc ĐÍCH
export async function listTransfers(actor: Actor, query: ListTransfersQuery) {
  const where: Prisma.TransferWhereInput = {};

  if (actor.role === "ADMIN") {
    if (query.fromWarehouseId) where.fromWarehouseId = query.fromWarehouseId;
    if (query.toWarehouseId) where.toWarehouseId = query.toWarehouseId;
  } else {
    // Manager/Staff bị ép cứng chỉ xem phiếu mà kho mình là NGUỒN hoặc ĐÍCH — fromWarehouseId/
    // toWarehouseId họ gửi lên bị bỏ qua (không phải lỗi, chỉ đơn giản là không có tác dụng),
    // cùng cách inventory.service.ts đang làm với warehouseId.
    if (!actor.warehouseId) {
      return { items: [], total: 0 };
    }
    where.OR = [{ fromWarehouseId: actor.warehouseId }, { toWarehouseId: actor.warehouseId }];
  }

  if (query.status) where.status = query.status;
  if (query.code) {
    where.code = { contains: query.code, mode: "insensitive" };
  }

  const skip = (query.page - 1) * query.limit;

  const [items, total] = await Promise.all([
    transferRepository.findManyTransfers(where, skip, query.limit),
    transferRepository.countTransfers(where),
  ]);

  return { items, total };
}

// Xem chi tiết 1 phiếu kèm timeline — không có CUSTOMER trong module này nên timeline luôn hiện
export async function getTransferById(actor: Actor, id: string) {
  const transfer = await transferRepository.findTransferDetail(id);
  if (!transfer) {
    throw new NotFoundError(Message.TRANSFER.NOT_FOUND.message, Message.TRANSFER.NOT_FOUND.code);
  }

  assertViewScope(actor, transfer);

  const timeline = await transferRepository.findTransferTimeline(id);

  const { fromWarehouseId, toWarehouseId, ...rest } = transfer;

  return {
    ...rest,
    timeline: timeline.map((row) => ({
      fromStatus: row.fromStatus,
      toStatus: row.toStatus,
      note: row.note,
      changedAt: row.createdAt,
      changedBy: row.changedBy,
    })),
  };
}

// Duyệt phiếu — Manager/Admin kho nguồn, chưa đụng Inventory
export async function confirmTransfer(actor: Actor, id: string) {
  const transfer = await transferRepository.findTransferById(id);
  if (!transfer) {
    throw new NotFoundError(Message.TRANSFER.NOT_FOUND.message, Message.TRANSFER.NOT_FOUND.code);
  }

  assertSourceScope(actor, transfer);

  if (transfer.status !== "DRAFT") {
    throw new ConflictError(Message.TRANSFER.INVALID_STATUS.message, Message.TRANSFER.INVALID_STATUS.code);
  }

  const updated = await prisma.$transaction(async (tx) => {
    const closed = await transferRepository.updateTransferStatus(tx, id, "DRAFT", {
      status: "CONFIRMED",
      confirmedAt: new Date(),
    });
    if (closed.count === 0) {
      throw new ConflictError(Message.TRANSFER.INVALID_STATUS.message, Message.TRANSFER.INVALID_STATUS.code);
    }

    await recordStatusChange(tx, {
      documentType: "TRANSFER",
      documentId: id,
      fromStatus: "DRAFT",
      toStatus: "CONFIRMED",
      changedByUserId: actor.id,
    });

    return transferRepository.findTransferWithItems(tx, id);
  });

  return updated!;
}

// Xuất hàng ở kho NGUỒN — chỉ trừ onHand kho A, KHÔNG đụng reserved (Transfer không giữ chỗ
// trước nên onHand >= quantityShipped là chốt CÓ THẬT, không phải lưới an toàn lý thuyết).
export async function shipTransfer(actor: Actor, id: string) {
  const transfer = await transferRepository.findTransferById(id);
  if (!transfer) {
    throw new NotFoundError(Message.TRANSFER.NOT_FOUND.message, Message.TRANSFER.NOT_FOUND.code);
  }

  assertSourceScope(actor, transfer);

  if (transfer.status !== "CONFIRMED") {
    throw new ConflictError(Message.TRANSFER.INVALID_STATUS.message, Message.TRANSFER.INVALID_STATUS.code);
  }

  const updated = await prisma.$transaction(async (tx) => {
    const closed = await transferRepository.updateTransferStatus(tx, id, "CONFIRMED", {
      status: "SHIPPED",
      shippedAt: new Date(),
    });
    if (closed.count === 0) {
      throw new ConflictError(Message.TRANSFER.INVALID_STATUS.message, Message.TRANSFER.INVALID_STATUS.code);
    }

    const items = await transferRepository.findTransferItems(tx, id);
    const skuIds = items.map((item) => item.skuId);

    // Transfer LUÔN đòi row Inventory kho nguồn có sẵn — không upsert, cùng nguyên tắc outbound
    const rows = await lockInventoryRows(tx, transfer.fromWarehouseId, skuIds);
    const rowBySkuId = new Map(rows.map((row) => [row.skuId, row]));

    if (rows.length !== items.length) {
      const declared = new Set(rows.map((row) => row.skuId));
      throw new NotFoundError(
        Message.TRANSFER.SKU_NOT_FOUND.message,
        Message.TRANSFER.SKU_NOT_FOUND.code,
        skuIds.filter((skuId) => !declared.has(skuId)),
      );
    }

    // Chốt CÓ THẬT: Transfer không giữ chỗ trước (không đụng reserved) nên onHand hoàn toàn
    // có thể đã bị bán/chuyển đi bởi giao dịch khác từ lúc tạo phiếu tới lúc ship.
    //
    // So với AVAILABLE (onHand - reserved), KHÔNG phải onHand trần — reserved là phần đã hứa
    // cho Reservation/SalesOrder khác, chuyển đi phần đó thì họ không còn đủ hàng để giao dù
    // Inventory chưa báo âm. Thiếu bước trừ này thì onHand >= quantity vẫn qua được dù
    // reserved > onHand sau khi trừ — để lọt xuống DB thì CHECK constraint mới chặn, bắn ra
    // lỗi 500 thô thay vì 409 OUT_OF_STOCK sạch. Đã kiểm bằng test thật (onHand=100,
    // reserved=70, chuyển 40 → phải chặn ở đây, không phải rơi xuống DB).
    const shortages = items
      .map((item) => ({ skuId: item.skuId, quantity: item.quantityShipped, row: rowBySkuId.get(item.skuId)! }))
      .filter((entry) => entry.row.quantityOnHand - entry.row.quantityReserved < entry.quantity);
    if (shortages.length > 0) {
      throw new ConflictError(Message.TRANSFER.OUT_OF_STOCK.message, Message.TRANSFER.OUT_OF_STOCK.code, shortages);
    }

    await applyInventoryDeltas(
      tx,
      rowBySkuId,
      items.map((item) => ({ skuId: item.skuId, onHand: -item.quantityShipped })),
      {
        movementType: "TRANSFER_OUT",
        referenceType: "TRANSFER",
        referenceId: id,
        createdByUserId: actor.id,
      },
    );

    await recordStatusChange(tx, {
      documentType: "TRANSFER",
      documentId: id,
      fromStatus: "CONFIRMED",
      toStatus: "SHIPPED",
      changedByUserId: actor.id,
    });

    return transferRepository.findTransferWithItems(tx, id);
  });

  return updated!;
}

// Nhận hàng ở kho ĐÍCH — cộng onHand kho B theo số thực nhận, upsert nếu SKU lần đầu về kho
// B (giống inbound). BẮT BUỘC gửi đủ mọi SKU trong phiếu.
export async function receiveTransfer(actor: Actor, id: string, input: ReceiveTransferInput) {
  const transfer = await transferRepository.findTransferById(id);
  if (!transfer) {
    throw new NotFoundError(Message.TRANSFER.NOT_FOUND.message, Message.TRANSFER.NOT_FOUND.code);
  }

  assertDestScope(actor, transfer);

  if (transfer.status !== "SHIPPED") {
    throw new ConflictError(Message.TRANSFER.INVALID_STATUS.message, Message.TRANSFER.INVALID_STATUS.code);
  }

  const updated = await prisma.$transaction(async (tx) => {
    const closed = await transferRepository.updateTransferStatus(tx, id, "SHIPPED", {
      status: "RECEIVED",
      receivedAt: new Date(),
    });
    if (closed.count === 0) {
      throw new ConflictError(Message.TRANSFER.INVALID_STATUS.message, Message.TRANSFER.INVALID_STATUS.code);
    }

    const dbItems = await transferRepository.findTransferItems(tx, id);
    const dbSkuIds = new Set(dbItems.map((item) => item.skuId));

    // Gộp body vào Map theo skuId thay vì đọc thẳng mảng — bắt được cả 2 lỗi cùng lúc:
    // (1) body gửi trùng skuId thì Map ghi đè, size không đổi nên phải TỰ phát hiện trùng
    // và từ chối, KHÔNG được lặng lẽ chấp nhận (bug thật đã dính: body gửi 2 dòng cùng SKU
    // qty 3 và 7, "mismatch" tính theo Set nên lọt qua, applyInventoryDeltas nhận thẳng mảng
    // thô nên cộng CẢ 2 dòng vào onHand (+10) trong khi TransferItem chỉ lưu dòng ghi sau
    // cùng (7) — 2 nguồn lệch nhau, hệt bug đã sửa ở inbound.receive nhưng đây không bị
    // CHECK constraint nào chặn nên lọt hẳn qua thành 200 OK với số liệu sai);
    // (2) vẫn giữ được so sánh "đủ mọi SKU trong phiếu" bằng kích thước Map.
    const bodyBySkuId = new Map<string, number>();
    for (const item of input.items) {
      const skuId = item.skuId.toLowerCase();
      if (bodyBySkuId.has(skuId)) {
        throw new BadRequestError(Message.TRANSFER.ITEMS_MISMATCH.message, Message.TRANSFER.ITEMS_MISMATCH.code);
      }
      bodyBySkuId.set(skuId, item.quantityReceived);
    }

    const mismatched =
      dbSkuIds.size !== bodyBySkuId.size || [...dbSkuIds].some((skuId) => !bodyBySkuId.has(skuId));
    if (mismatched) {
      throw new BadRequestError(Message.TRANSFER.ITEMS_MISMATCH.message, Message.TRANSFER.ITEMS_MISMATCH.code);
    }

    for (const [skuId, quantityReceived] of bodyBySkuId) {
      await transferRepository.updateTransferItemReceived(tx, id, skuId, quantityReceived);
    }

    const skuIds = [...dbSkuIds];
    await ensureInventoryRows(tx, transfer.toWarehouseId, skuIds);
    const rows = await lockInventoryRows(tx, transfer.toWarehouseId, skuIds);
    const rowBySkuId = new Map(rows.map((row) => [row.skuId, row]));

    await applyInventoryDeltas(
      tx,
      rowBySkuId,
      [...bodyBySkuId.entries()].map(([skuId, onHand]) => ({ skuId, onHand })),
      {
        movementType: "TRANSFER_IN",
        referenceType: "TRANSFER",
        referenceId: id,
        createdByUserId: actor.id,
      },
    );

    await recordStatusChange(tx, {
      documentType: "TRANSFER",
      documentId: id,
      fromStatus: "SHIPPED",
      toStatus: "RECEIVED",
      changedByUserId: actor.id,
    });

    return transferRepository.findTransferWithItems(tx, id);
  });

  return updated!;
}

// Huỷ phiếu còn DRAFT/CONFIRMED — không chạm Inventory (chưa từng trừ ở 2 trạng thái này)
export async function cancelTransfer(actor: Actor, id: string, input: CancelTransferInput) {
  const transfer = await transferRepository.findTransferById(id);
  if (!transfer) {
    throw new NotFoundError(Message.TRANSFER.NOT_FOUND.message, Message.TRANSFER.NOT_FOUND.code);
  }

  assertSourceScope(actor, transfer);

  const allowed = CANCELLABLE_STATUS[actor.role];
  if (!allowed.includes(transfer.status)) {
    throw new ConflictError(Message.TRANSFER.INVALID_STATUS.message, Message.TRANSFER.INVALID_STATUS.code);
  }

  const updated = await prisma.$transaction(async (tx) => {
    const closed = await transferRepository.updateTransferStatus(tx, id, transfer.status, {
      status: "CANCELLED",
      cancelReason: input.cancelReason ?? null,
      cancelledAt: new Date(),
    });
    if (closed.count === 0) {
      throw new ConflictError(Message.TRANSFER.INVALID_STATUS.message, Message.TRANSFER.INVALID_STATUS.code);
    }

    await recordStatusChange(tx, {
      documentType: "TRANSFER",
      documentId: id,
      fromStatus: transfer.status,
      toStatus: "CANCELLED",
      changedByUserId: actor.id,
    });

    return transferRepository.findTransferWithItems(tx, id);
  });

  return updated!;
}
