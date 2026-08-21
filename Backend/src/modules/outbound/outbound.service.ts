import type { Prisma, UserRole } from "@prisma/client";
import { prisma } from "../../config/prisma.js";
import { Message } from "../../constants/message.js";
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from "../../errors/appError.js";
import { applyInventoryDeltas, lockInventoryRows } from "../../utils/inventory.core.js";
import { recordStatusChange } from "../../utils/status.core.js";
import * as outboundRepository from "./outbound.repository.js";
import type {
  CancelOutboundInput,
  CreateOutboundInput,
  ListOutboundsQuery,
} from "./outbound.schema.js";

interface Actor {
  id: string;
  role: UserRole;
  warehouseId: string | null;
}

// Manager/Staff chỉ đụng phiếu thuộc đúng kho mình, Admin không giới hạn — cùng cách sales-order/inbound
function assertInScope(actor: Actor, outbound: { warehouseId: string }): void {
  if (actor.role === "ADMIN") return;
  if (outbound.warehouseId !== actor.warehouseId) {
    throw new NotFoundError(Message.OUTBOUND.NOT_FOUND.message, Message.OUTBOUND.NOT_FOUND.code);
  }
}

const CANCELLABLE_STATUS: Record<UserRole, readonly string[]> = {
  WAREHOUSE_STAFF: ["DRAFT"],
  WAREHOUSE_MANAGER: ["DRAFT", "CONFIRMED"],
  ADMIN: ["DRAFT", "CONFIRMED"],
  CUSTOMER: [],
};

// Gộp dòng trùng skuId (hạ chữ thường vì UUID nhận cả chữ hoa) — khác inbound: OutboundItem
// không có giá riêng từng dòng nên 2 dòng trùng SKU không mang thông tin gì khác biệt
function mergeItems(items: Array<{ skuId: string; quantity: number }>) {
  const merged = new Map<string, number>();
  for (const item of items) {
    const skuId = item.skuId.toLowerCase();
    merged.set(skuId, (merged.get(skuId) ?? 0) + item.quantity);
  }
  return [...merged.entries()].map(([skuId, quantity]) => ({ skuId, quantity }));
}

// Tạo phiếu xuất (DRAFT) — chưa đụng Inventory. reason quyết định salesOrderId/supplierId/items
// bắt buộc cái nào. Nhánh SALES_ORDER tự lấy items từ SalesOrderItem (không nhận từ client) và
// khoá dòng SalesOrder TRƯỚC (cùng transaction) để chặn 2 request tạo đồng thời cho cùng đơn.
export async function createOutbound(actor: Actor, input: CreateOutboundInput) {
  if (actor.role !== "ADMIN" && input.warehouseId !== actor.warehouseId) {
    throw new ForbiddenError(
      Message.OUTBOUND.FORBIDDEN_WAREHOUSE.message,
      Message.OUTBOUND.FORBIDDEN_WAREHOUSE.code,
    );
  }

  const warehouse = await outboundRepository.findWarehouseById(input.warehouseId);
  if (!warehouse || warehouse.status !== "ACTIVE") {
    throw new NotFoundError(
      Message.OUTBOUND.WAREHOUSE_NOT_FOUND.message,
      Message.OUTBOUND.WAREHOUSE_NOT_FOUND.code,
    );
  }

  if (input.reason === "SALES_ORDER") {
    if (!input.salesOrderId) {
      throw new BadRequestError(
        Message.OUTBOUND.SALES_ORDER_REQUIRED.message,
        Message.OUTBOUND.SALES_ORDER_REQUIRED.code,
      );
    }
    if (input.supplierId) {
      throw new BadRequestError(
        Message.OUTBOUND.SUPPLIER_NOT_ALLOWED.message,
        Message.OUTBOUND.SUPPLIER_NOT_ALLOWED.code,
      );
    }
    if (input.items) {
      throw new BadRequestError(
        Message.OUTBOUND.ITEMS_NOT_ALLOWED.message,
        Message.OUTBOUND.ITEMS_NOT_ALLOWED.code,
      );
    }

    const salesOrder = await outboundRepository.findSalesOrderForOutbound(input.salesOrderId);
    if (!salesOrder) {
      throw new NotFoundError(
        Message.OUTBOUND.SALES_ORDER_NOT_FOUND.message,
        Message.OUTBOUND.SALES_ORDER_NOT_FOUND.code,
      );
    }
    if (salesOrder.status !== "CONFIRMED") {
      throw new ConflictError(
        Message.OUTBOUND.SALES_ORDER_NOT_CONFIRMED.message,
        Message.OUTBOUND.SALES_ORDER_NOT_CONFIRMED.code,
      );
    }

    return prisma.$transaction(async (tx) => {
      // Khoá SalesOrder TRƯỚC bất kỳ thao tác nào khác trong transaction này — 2 request tạo
      // outbound đồng thời cho cùng đơn sẽ xếp hàng ở đây, không race trên bước check bên dưới.
      const locked = await outboundRepository.lockSalesOrderRow(tx, input.salesOrderId!);
      const order = locked[0];
      if (!order || order.status !== "CONFIRMED") {
        throw new ConflictError(
          Message.OUTBOUND.SALES_ORDER_NOT_CONFIRMED.message,
          Message.OUTBOUND.SALES_ORDER_NOT_CONFIRMED.code,
        );
      }

      const existing = await outboundRepository.findActiveOutboundBySalesOrderId(tx, order.id);
      if (existing) {
        throw new ConflictError(
          Message.OUTBOUND.SALES_ORDER_ALREADY_HAS_OUTBOUND.message,
          Message.OUTBOUND.SALES_ORDER_ALREADY_HAS_OUTBOUND.code,
        );
      }

      const lines = await outboundRepository.findSalesOrderItemsForOutbound(tx, order.id);
      const code = await outboundRepository.nextOutboundCode(tx);

      return outboundRepository.createOutboundWithItems(tx, {
        code,
        warehouseId: input.warehouseId,
        reason: "SALES_ORDER",
        salesOrderId: order.id,
        supplierId: null,
        note: input.note ?? null,
        createdByUserId: actor.id,
        items: lines.map((line) => ({ skuId: line.skuId, quantity: line.quantity })),
      });
    });
  }

  // 3 nhánh còn lại: RETURN_TO_SUPPLIER / DAMAGED / OTHER — items bắt buộc, thủ công
  if (!input.items || input.items.length === 0) {
    throw new BadRequestError(
      Message.OUTBOUND.ITEMS_REQUIRED.message,
      Message.OUTBOUND.ITEMS_REQUIRED.code,
    );
  }

  let supplierId: string | null = null;

  if (input.reason === "RETURN_TO_SUPPLIER") {
    if (!input.supplierId) {
      throw new BadRequestError(
        Message.OUTBOUND.SUPPLIER_REQUIRED.message,
        Message.OUTBOUND.SUPPLIER_REQUIRED.code,
      );
    }
    if (input.salesOrderId) {
      throw new BadRequestError(
        Message.OUTBOUND.SALES_ORDER_NOT_ALLOWED.message,
        Message.OUTBOUND.SALES_ORDER_NOT_ALLOWED.code,
      );
    }

    const supplier = await outboundRepository.findSupplierById(input.supplierId);
    if (!supplier) {
      throw new NotFoundError(
        Message.OUTBOUND.SUPPLIER_NOT_FOUND.message,
        Message.OUTBOUND.SUPPLIER_NOT_FOUND.code,
      );
    }
    supplierId = supplier.id;
  } else {
    // DAMAGED / OTHER — cả salesOrderId lẫn supplierId đều cấm
    if (input.salesOrderId) {
      throw new BadRequestError(
        Message.OUTBOUND.SALES_ORDER_NOT_ALLOWED.message,
        Message.OUTBOUND.SALES_ORDER_NOT_ALLOWED.code,
      );
    }
    if (input.supplierId) {
      throw new BadRequestError(
        Message.OUTBOUND.SUPPLIER_NOT_ALLOWED.message,
        Message.OUTBOUND.SUPPLIER_NOT_ALLOWED.code,
      );
    }
    if (input.reason === "OTHER" && !input.note) {
      throw new BadRequestError(
        Message.OUTBOUND.NOTE_REQUIRED.message,
        Message.OUTBOUND.NOTE_REQUIRED.code,
      );
    }
  }

  const items = mergeItems(input.items);
  const skuIds = items.map((item) => item.skuId);
  const skus = await outboundRepository.findSkusForOutbound(skuIds);
  if (skus.length !== skuIds.length) {
    const found = new Set(skus.map((sku) => sku.id));
    throw new NotFoundError(
      Message.OUTBOUND.SKU_NOT_FOUND.message,
      Message.OUTBOUND.SKU_NOT_FOUND.code,
      skuIds.filter((skuId) => !found.has(skuId)),
    );
  }

  return prisma.$transaction(async (tx) => {
    const code = await outboundRepository.nextOutboundCode(tx);

    return outboundRepository.createOutboundWithItems(tx, {
      code,
      warehouseId: input.warehouseId,
      reason: input.reason,
      salesOrderId: null,
      supplierId,
      note: input.note ?? null,
      createdByUserId: actor.id,
      items,
    });
  });
}

// Danh sách phiếu có phân trang — Manager/Staff bị ép cứng chỉ xem kho mình
export async function listOutbounds(actor: Actor, query: ListOutboundsQuery) {
  const where: Prisma.OutboundWhereInput = {};

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
  if (query.salesOrderId) where.salesOrderId = query.salesOrderId;
  if (query.supplierId) where.supplierId = query.supplierId;
  if (query.code) {
    where.code = { contains: query.code, mode: "insensitive" };
  }

  const skip = (query.page - 1) * query.limit;

  const [items, total] = await Promise.all([
    outboundRepository.findManyOutbounds(where, skip, query.limit),
    outboundRepository.countOutbounds(where),
  ]);

  return { items, total };
}

// Xem chi tiết 1 phiếu kèm timeline — không có CUSTOMER trong module này nên timeline luôn hiện
export async function getOutboundById(actor: Actor, id: string) {
  const outbound = await outboundRepository.findOutboundDetail(id);
  if (!outbound) {
    throw new NotFoundError(Message.OUTBOUND.NOT_FOUND.message, Message.OUTBOUND.NOT_FOUND.code);
  }

  assertInScope(actor, outbound);

  const timeline = await outboundRepository.findOutboundTimeline(id);

  const { warehouseId, ...rest } = outbound;

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

// Duyệt phiếu — Manager/Admin, chưa đụng Inventory
export async function confirmOutbound(actor: Actor, id: string) {
  const outbound = await outboundRepository.findOutboundById(id);
  if (!outbound) {
    throw new NotFoundError(Message.OUTBOUND.NOT_FOUND.message, Message.OUTBOUND.NOT_FOUND.code);
  }

  assertInScope(actor, outbound);

  if (outbound.status !== "DRAFT") {
    throw new ConflictError(
      Message.OUTBOUND.INVALID_STATUS.message,
      Message.OUTBOUND.INVALID_STATUS.code,
    );
  }

  const updated = await prisma.$transaction(async (tx) => {
    const closed = await outboundRepository.updateOutboundStatus(tx, id, "DRAFT", {
      status: "CONFIRMED",
      confirmedAt: new Date(),
    });
    if (closed.count === 0) {
      throw new ConflictError(
        Message.OUTBOUND.INVALID_STATUS.message,
        Message.OUTBOUND.INVALID_STATUS.code,
      );
    }

    await recordStatusChange(tx, {
      documentType: "OUTBOUND",
      documentId: id,
      fromStatus: "DRAFT",
      toStatus: "CONFIRMED",
      changedByUserId: actor.id,
    });

    return outboundRepository.findOutboundWithItems(tx, id);
  });

  return updated!;
}

// Xuất hàng — bước DUY NHẤT chạm Inventory, trừ CẢ onHand LẪN reserved cùng lúc.
// Thứ tự khoá: SalesOrder trước (nếu reason = SALES_ORDER), Inventory sau — khớp
// cancelSalesOrder để không ôm chéo lock (xem docs/Business_SalesOrder.md note 13).
export async function shipOutbound(actor: Actor, id: string) {
  const outbound = await outboundRepository.findOutboundById(id);
  if (!outbound) {
    throw new NotFoundError(Message.OUTBOUND.NOT_FOUND.message, Message.OUTBOUND.NOT_FOUND.code);
  }

  assertInScope(actor, outbound);

  if (outbound.status !== "CONFIRMED") {
    throw new ConflictError(
      Message.OUTBOUND.INVALID_STATUS.message,
      Message.OUTBOUND.INVALID_STATUS.code,
    );
  }

  const updated = await prisma.$transaction(async (tx) => {
    // Bước 1 (rẻ): khoá SalesOrder trước tiên nếu có — TRƯỚC cả Outbound guard, để giữ
    // đúng thứ tự SalesOrder -> Inventory dù request có bị 409 ở bước 2 thì cũng không
    // đổi thứ tự khoá giữa các nhánh.
    let lockedOrder: { id: string; status: string } | null = null;
    if (outbound.reason === "SALES_ORDER" && outbound.salesOrderId) {
      const locked = await outboundRepository.lockSalesOrderRow(tx, outbound.salesOrderId);
      lockedOrder = locked[0] ?? null;
      if (!lockedOrder || lockedOrder.status !== "CONFIRMED") {
        // Đơn đã bị huỷ/refund xen giữa lúc phiếu xuất đang chờ ship — KHÔNG xuất hàng
        // cho đơn không còn hiệu lực.
        throw new ConflictError(
          Message.OUTBOUND.SALES_ORDER_NOT_CONFIRMED.message,
          Message.OUTBOUND.SALES_ORDER_NOT_CONFIRMED.code,
        );
      }
    }

    const closed = await outboundRepository.updateOutboundStatus(tx, id, "CONFIRMED", {
      status: "SHIPPED",
      shippedAt: new Date(),
    });
    if (closed.count === 0) {
      throw new ConflictError(
        Message.OUTBOUND.INVALID_STATUS.message,
        Message.OUTBOUND.INVALID_STATUS.code,
      );
    }

    const items = await outboundRepository.findOutboundItems(tx, id);
    const skuIds = items.map((item) => item.skuId);

    const rows = await lockInventoryRows(tx, outbound.warehouseId, skuIds);
    const rowBySkuId = new Map(rows.map((row) => [row.skuId, row]));

    // Outbound LUÔN đòi row Inventory có sẵn — không upsert như inbound (SKU chưa từng
    // nhập vào kho này thì không thể xuất, đây là lỗi dữ liệu chứ không phải case hợp lệ)
    if (rows.length !== items.length) {
      const declared = new Set(rows.map((row) => row.skuId));
      throw new NotFoundError(
        Message.OUTBOUND.SKU_NOT_FOUND.message,
        Message.OUTBOUND.SKU_NOT_FOUND.code,
        skuIds.filter((skuId) => !declared.has(skuId)),
      );
    }

    // Lưới an toàn: dù reserved <= onHand luôn đúng nên onHand đủ trừ về mặt lý thuyết,
    // vẫn kiểm tường minh trước khi trừ thay vì để CHECK constraint dưới DB bắn lỗi khó đọc.
    const shortages = items
      .map((item) => ({ skuId: item.skuId, quantity: item.quantity, row: rowBySkuId.get(item.skuId)! }))
      .filter((entry) => entry.row.quantityOnHand < entry.quantity);
    if (shortages.length > 0) {
      throw new ConflictError(Message.OUTBOUND.OUT_OF_STOCK.message, Message.OUTBOUND.OUT_OF_STOCK.code);
    }

    // reserved chỉ trừ khi reason = SALES_ORDER — đó là lúc hàng đang bị GIỮ CHỖ RIÊNG cho
    // đơn này (reserved đã += lúc tạo SalesOrder). 3 lý do còn lại (RETURN_TO_SUPPLIER/
    // DAMAGED/OTHER) không hề qua bước giữ chỗ nào — trừ reserved ở đây sẽ ăn nhầm vào phần
    // đang giữ cho một đơn hàng KHÁC hoàn toàn không liên quan tới phiếu xuất này.
    await applyInventoryDeltas(
      tx,
      rowBySkuId,
      items.map((item) => ({
        skuId: item.skuId,
        onHand: -item.quantity,
        ...(outbound.reason === "SALES_ORDER" ? { reserved: -item.quantity } : {}),
      })),
      {
        movementType: "OUTBOUND",
        referenceType: "OUTBOUND",
        referenceId: id,
        createdByUserId: actor.id,
      },
    );

    await recordStatusChange(tx, {
      documentType: "OUTBOUND",
      documentId: id,
      fromStatus: "CONFIRMED",
      toStatus: "SHIPPED",
      changedByUserId: actor.id,
    });

    if (lockedOrder) {
      const completed = await outboundRepository.completeSalesOrder(tx, lockedOrder.id);
      if (completed.count === 0) {
        // Dòng đã bị khoá từ bước 1 trong CÙNG transaction nên chỉ xảy ra nếu code gọi sai
        // thứ tự — không phải race, ném lỗi trần để lộ ngay lúc test thay vì âm thầm bỏ qua.
        throw new Error(`Không đổi được SalesOrder ${lockedOrder.id} sang COMPLETED dù đã khoá`);
      }

      await recordStatusChange(tx, {
        documentType: "SALES_ORDER",
        documentId: lockedOrder.id,
        fromStatus: "CONFIRMED",
        toStatus: "COMPLETED",
        changedByUserId: actor.id,
      });
    }

    return outboundRepository.findOutboundWithItems(tx, id);
  });

  return updated!;
}

// Huỷ phiếu còn DRAFT/CONFIRMED — không chạm Inventory (chưa từng trừ ở 2 trạng thái này)
export async function cancelOutbound(actor: Actor, id: string, input: CancelOutboundInput) {
  const outbound = await outboundRepository.findOutboundById(id);
  if (!outbound) {
    throw new NotFoundError(Message.OUTBOUND.NOT_FOUND.message, Message.OUTBOUND.NOT_FOUND.code);
  }

  assertInScope(actor, outbound);

  const allowed = CANCELLABLE_STATUS[actor.role];
  if (!allowed.includes(outbound.status)) {
    throw new ConflictError(
      Message.OUTBOUND.INVALID_STATUS.message,
      Message.OUTBOUND.INVALID_STATUS.code,
    );
  }

  const updated = await prisma.$transaction(async (tx) => {
    const closed = await outboundRepository.updateOutboundStatus(tx, id, outbound.status, {
      status: "CANCELLED",
      cancelReason: input.cancelReason ?? null,
      cancelledAt: new Date(),
    });
    if (closed.count === 0) {
      throw new ConflictError(
        Message.OUTBOUND.INVALID_STATUS.message,
        Message.OUTBOUND.INVALID_STATUS.code,
      );
    }

    await recordStatusChange(tx, {
      documentType: "OUTBOUND",
      documentId: id,
      fromStatus: outbound.status,
      toStatus: "CANCELLED",
      changedByUserId: actor.id,
    });

    return outboundRepository.findOutboundWithItems(tx, id);
  });

  return updated!;
}
