import type { Prisma, UserRole } from "@prisma/client";
import { prisma } from "../../config/prisma.js";
import { Message } from "../../constants/message.js";
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from "../../errors/appError.js";
import { applyInventoryDeltas, ensureInventoryRows, lockInventoryRows } from "../../utils/inventory.core.js";
import { recordStatusChange } from "../../utils/status.core.js";
import * as inboundRepository from "./inbound.repository.js";
import type {
  CancelInboundInput,
  CreateInboundInput,
  ListInboundsQuery,
  ReceiveInboundInput,
} from "./inbound.schema.js";

interface Actor {
  id: string;
  role: UserRole;
  warehouseId: string | null;
}

// Manager/Staff chỉ đụng phiếu thuộc đúng kho mình, Admin không giới hạn — trả 404 để không
// lộ phiếu tồn tại ở kho khác, cùng cách làm với sales-order/reservation.
function assertInScope(actor: Actor, inbound: { warehouseId: string }): void {
  if (actor.role === "ADMIN") return;
  if (inbound.warehouseId !== actor.warehouseId) {
    throw new NotFoundError(Message.INBOUND.NOT_FOUND.message, Message.INBOUND.NOT_FOUND.code);
  }
}

const CANCELLABLE_STATUS: Record<UserRole, readonly string[]> = {
  // Huỷ DRAFT — người tạo (mọi role tạo được) tự huỷ được; huỷ CONFIRMED là đảo quyết định
  // của cấp trên nên cần cấp tương đương (Manager/Admin) mới được đảo — theo note 7.
  WAREHOUSE_STAFF: ["DRAFT"],
  WAREHOUSE_MANAGER: ["DRAFT", "CONFIRMED"],
  ADMIN: ["DRAFT", "CONFIRMED"],
  CUSTOMER: [],
};

// Tạo phiếu nhập (DRAFT) — chưa đụng Inventory. reason quyết định supplierId/salesOrderId
// bắt buộc cái nào, validate ở đây (service layer) theo note 2b, không phải DB constraint.
export async function createInbound(actor: Actor, input: CreateInboundInput) {
  if (actor.role !== "ADMIN" && input.warehouseId !== actor.warehouseId) {
    throw new ForbiddenError(
      Message.INBOUND.FORBIDDEN_WAREHOUSE.message,
      Message.INBOUND.FORBIDDEN_WAREHOUSE.code,
    );
  }

  const warehouse = await inboundRepository.findWarehouseById(input.warehouseId);
  if (!warehouse || warehouse.status !== "ACTIVE") {
    throw new NotFoundError(
      Message.INBOUND.WAREHOUSE_NOT_FOUND.message,
      Message.INBOUND.WAREHOUSE_NOT_FOUND.code,
    );
  }

  let supplierId: string | null = null;
  let salesOrderId: string | null = null;

  if (input.reason === "FROM_SUPPLIER") {
    if (!input.supplierId) {
      throw new BadRequestError(
        Message.INBOUND.SUPPLIER_REQUIRED.message,
        Message.INBOUND.SUPPLIER_REQUIRED.code,
      );
    }
    if (input.salesOrderId) {
      throw new BadRequestError(
        Message.INBOUND.SALES_ORDER_NOT_ALLOWED.message,
        Message.INBOUND.SALES_ORDER_NOT_ALLOWED.code,
      );
    }

    const supplier = await inboundRepository.findSupplierById(input.supplierId);
    if (!supplier) {
      throw new NotFoundError(
        Message.INBOUND.SUPPLIER_NOT_FOUND.message,
        Message.INBOUND.SUPPLIER_NOT_FOUND.code,
      );
    }
    supplierId = supplier.id;
  } else {
    if (!input.salesOrderId) {
      throw new BadRequestError(
        Message.INBOUND.SALES_ORDER_REQUIRED.message,
        Message.INBOUND.SALES_ORDER_REQUIRED.code,
      );
    }
    if (input.supplierId) {
      throw new BadRequestError(
        Message.INBOUND.SUPPLIER_NOT_ALLOWED.message,
        Message.INBOUND.SUPPLIER_NOT_ALLOWED.code,
      );
    }

    const salesOrder = await inboundRepository.findSalesOrderById(input.salesOrderId);
    if (!salesOrder) {
      throw new NotFoundError(
        Message.INBOUND.SALES_ORDER_NOT_FOUND.message,
        Message.INBOUND.SALES_ORDER_NOT_FOUND.code,
      );
    }
    // Chỉ đơn đã giao hoàn thành mới được trả hàng — chặn cả đơn còn PENDING (chưa giao)
    // lẫn đơn đã CANCELLED/REFUNDED (không có hàng thật để trả)
    if (salesOrder.status !== "COMPLETED") {
      throw new ConflictError(
        Message.INBOUND.SALES_ORDER_NOT_COMPLETED.message,
        Message.INBOUND.SALES_ORDER_NOT_COMPLETED.code,
      );
    }
    salesOrderId = salesOrder.id;
  }

  const skuIds = [...new Set(input.items.map((item) => item.skuId.toLowerCase()))];
  const skus = await inboundRepository.findSkusForInbound(skuIds);
  if (skus.length !== skuIds.length) {
    const found = new Set(skus.map((sku) => sku.id));
    throw new NotFoundError(
      Message.INBOUND.SKU_NOT_FOUND.message,
      Message.INBOUND.SKU_NOT_FOUND.code,
      skuIds.filter((skuId) => !found.has(skuId)),
    );
  }

  return prisma.$transaction(async (tx) => {
    const code = await inboundRepository.nextInboundCode(tx);

    return inboundRepository.createInboundWithItems(tx, {
      code,
      warehouseId: input.warehouseId,
      reason: input.reason,
      supplierId,
      salesOrderId,
      createdByUserId: actor.id,
      items: input.items.map((item) => ({
        skuId: item.skuId,
        quantityOrdered: item.quantityOrdered,
        unitCost: item.unitCost,
        note: item.note ?? null,
      })),
    });
  });
}

// Danh sách phiếu có phân trang — Manager/Staff bị ép cứng chỉ xem kho mình
export async function listInbounds(actor: Actor, query: ListInboundsQuery) {
  const where: Prisma.InboundWhereInput = {};

  if (actor.role === "ADMIN") {
    if (query.warehouseId) where.warehouseId = query.warehouseId;
  } else {
    where.warehouseId = actor.warehouseId ?? undefined;
    if (!actor.warehouseId) {
      return { items: [], total: 0 };
    }
  }

  if (query.status) where.status = query.status;
  if (query.reason) where.reason = query.reason;
  if (query.supplierId) where.supplierId = query.supplierId;
  if (query.code) {
    where.code = { contains: query.code, mode: "insensitive" };
  }

  const skip = (query.page - 1) * query.limit;

  const [items, total] = await Promise.all([
    inboundRepository.findManyInbounds(where, skip, query.limit),
    inboundRepository.countInbounds(where),
  ]);

  return { items, total };
}

// Xem chi tiết 1 phiếu kèm timeline — không có CUSTOMER trong module này nên timeline luôn hiện
export async function getInboundById(actor: Actor, id: string) {
  const inbound = await inboundRepository.findInboundDetail(id);
  if (!inbound) {
    throw new NotFoundError(Message.INBOUND.NOT_FOUND.message, Message.INBOUND.NOT_FOUND.code);
  }

  assertInScope(actor, inbound);

  const timeline = await inboundRepository.findInboundTimeline(id);

  const { warehouseId, ...rest } = inbound;

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

// Duyệt phiếu — Manager/Admin, chưa đụng Inventory (note 1: CONFIRMED vẫn chưa cộng onHand)
export async function confirmInbound(actor: Actor, id: string) {
  const inbound = await inboundRepository.findInboundById(id);
  if (!inbound) {
    throw new NotFoundError(Message.INBOUND.NOT_FOUND.message, Message.INBOUND.NOT_FOUND.code);
  }

  assertInScope(actor, inbound);

  if (inbound.status !== "DRAFT") {
    throw new ConflictError(
      Message.INBOUND.INVALID_STATUS.message,
      Message.INBOUND.INVALID_STATUS.code,
    );
  }

  const updated = await prisma.$transaction(async (tx) => {
    const closed = await inboundRepository.updateInboundStatus(tx, id, "DRAFT", {
      status: "CONFIRMED",
      confirmedAt: new Date(),
    });
    if (closed.count === 0) {
      throw new ConflictError(
        Message.INBOUND.INVALID_STATUS.message,
        Message.INBOUND.INVALID_STATUS.code,
      );
    }

    await recordStatusChange(tx, {
      documentType: "INBOUND",
      documentId: id,
      fromStatus: "DRAFT",
      toStatus: "CONFIRMED",
      changedByUserId: actor.id,
    });

    return inboundRepository.findInboundWithItems(tx, id);
  });

  return updated!;
}

// Nhận hàng — bước DUY NHẤT chạm Inventory. BẮT BUỘC gửi đủ mọi item trong phiếu (note đã chốt),
// cộng onHand theo quantityReceived thật, upsert dòng tồn nếu SKU lần đầu về kho này.
export async function receiveInbound(actor: Actor, id: string, input: ReceiveInboundInput) {
  const inbound = await inboundRepository.findInboundById(id);
  if (!inbound) {
    throw new NotFoundError(Message.INBOUND.NOT_FOUND.message, Message.INBOUND.NOT_FOUND.code);
  }

  assertInScope(actor, inbound);

  if (inbound.status !== "CONFIRMED") {
    throw new ConflictError(
      Message.INBOUND.INVALID_STATUS.message,
      Message.INBOUND.INVALID_STATUS.code,
    );
  }

  const updated = await prisma.$transaction(async (tx) => {
    // Chốt rẻ trước, khoá Inventory đắt sau — cùng thứ tự cancelSalesOrder/cancelReservation.
    // Không có nguy cơ ABBA với module khác: Inbound.id là dòng riêng của phiếu này, không
    // module nào từng khoá nó theo chiều ngược lại (khác cặp SalesOrder+Inventory ở note 13).
    const closed = await inboundRepository.updateInboundStatus(tx, id, "CONFIRMED", {
      status: "RECEIVED",
      receivedAt: new Date(),
    });
    if (closed.count === 0) {
      throw new ConflictError(
        Message.INBOUND.INVALID_STATUS.message,
        Message.INBOUND.INVALID_STATUS.code,
      );
    }

    const dbItems = await inboundRepository.findInboundItems(tx, id);
    const dbItemIds = new Set(dbItems.map((item) => item.id));
    const bodyItemIds = new Set(input.items.map((item) => item.itemId));

    // Định danh theo itemId (không phải skuId): 1 phiếu có thể có 2 dòng cùng SKU khác lô/giá
    const mismatched =
      dbItemIds.size !== bodyItemIds.size ||
      [...dbItemIds].some((itemId) => !bodyItemIds.has(itemId));
    if (mismatched) {
      throw new BadRequestError(
        Message.INBOUND.ITEMS_MISMATCH.message,
        Message.INBOUND.ITEMS_MISMATCH.code,
      );
    }

    const skuByItemId = new Map(dbItems.map((item) => [item.id, item.skuId]));
    const quantityByItemId = new Map(input.items.map((item) => [item.itemId, item.quantityReceived]));

    for (const item of input.items) {
      await inboundRepository.updateInboundItemReceived(tx, item.itemId, item.quantityReceived);
    }

    // Gộp theo skuId TRƯỚC khi tính delta tồn kho: 2 dòng cùng SKU thì cộng 1 lần trên
    // Inventory, tránh applyInventoryDeltas ghi 2 movement cùng lấy chung 1 mốc "before"
    // (giá trị khoá ban đầu), làm sai audit dù onHand cuối vẫn đúng nhờ increment atomic.
    const totalBySkuId = new Map<string, number>();
    for (const [itemId, skuId] of skuByItemId) {
      const quantity = quantityByItemId.get(itemId)!;
      totalBySkuId.set(skuId, (totalBySkuId.get(skuId) ?? 0) + quantity);
    }
    const skuIds = [...totalBySkuId.keys()];

    await ensureInventoryRows(tx, inbound.warehouseId, skuIds);
    const rows = await lockInventoryRows(tx, inbound.warehouseId, skuIds);
    const rowBySkuId = new Map(rows.map((row) => [row.skuId, row]));

    await applyInventoryDeltas(
      tx,
      rowBySkuId,
      [...totalBySkuId.entries()].map(([skuId, onHand]) => ({ skuId, onHand })),
      {
        movementType: "INBOUND",
        referenceType: "INBOUND",
        referenceId: id,
        createdByUserId: actor.id,
      },
    );

    await recordStatusChange(tx, {
      documentType: "INBOUND",
      documentId: id,
      fromStatus: "CONFIRMED",
      toStatus: "RECEIVED",
      changedByUserId: actor.id,
    });

    return inboundRepository.findInboundWithItems(tx, id);
  });

  return updated!;
}

// Huỷ phiếu còn DRAFT/CONFIRMED — không chạm Inventory (chưa từng cộng onHand ở 2 trạng thái này)
export async function cancelInbound(actor: Actor, id: string, input: CancelInboundInput) {
  const inbound = await inboundRepository.findInboundById(id);
  if (!inbound) {
    throw new NotFoundError(Message.INBOUND.NOT_FOUND.message, Message.INBOUND.NOT_FOUND.code);
  }

  assertInScope(actor, inbound);

  const allowed = CANCELLABLE_STATUS[actor.role];
  if (!allowed.includes(inbound.status)) {
    throw new ConflictError(
      Message.INBOUND.INVALID_STATUS.message,
      Message.INBOUND.INVALID_STATUS.code,
    );
  }

  const updated = await prisma.$transaction(async (tx) => {
    const closed = await inboundRepository.updateInboundStatus(tx, id, inbound.status, {
      status: "CANCELLED",
      cancelReason: input.cancelReason ?? null,
      cancelledAt: new Date(),
    });
    if (closed.count === 0) {
      throw new ConflictError(
        Message.INBOUND.INVALID_STATUS.message,
        Message.INBOUND.INVALID_STATUS.code,
      );
    }

    await recordStatusChange(tx, {
      documentType: "INBOUND",
      documentId: id,
      fromStatus: inbound.status,
      toStatus: "CANCELLED",
      changedByUserId: actor.id,
    });

    return inboundRepository.findInboundWithItems(tx, id);
  });

  return updated!;
}
