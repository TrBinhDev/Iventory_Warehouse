import type { Prisma, UserRole } from "@prisma/client";
import { prisma } from "../../config/prisma.js";
import { Message } from "../../constants/message.js";
import { ConflictError, ForbiddenError, NotFoundError } from "../../errors/appError.js";
import { recordStatusChange } from "../../utils/status.core.js";
import * as adjustmentRepository from "./adjustment.repository.js";
import type {
  CreateAdjustmentInput,
  ListAdjustmentsQuery,
} from "./adjustment.schema.js";

interface Actor {
  id: string;
  role: UserRole;
  warehouseId: string | null;
}

// Manager/Admin only ở MỌI bước (kể cả xem) — kiểm soát nội bộ, Staff không được biết/ảnh
// hưởng số liệu kiểm kê của chính kho mình đang làm việc (note 3, Business_InventoryAdjustment.md)
function assertScope(actor: Actor, adjustment: { warehouseId: string }): void {
  if (actor.role === "ADMIN") return;
  if (actor.warehouseId !== adjustment.warehouseId) {
    throw new NotFoundError(Message.INVENTORY_ADJUSTMENT.NOT_FOUND.message, Message.INVENTORY_ADJUSTMENT.NOT_FOUND.code);
  }
}

// Mở phiếu kiểm kê (DRAFT) — snapshot quantityBefore + expectedVersion từ Inventory hiện tại,
// KHÔNG khoá gì (chỉ đọc để lưu mốc, khoá thật xảy ra lúc complete). Trùng skuId bị từ chối
// thẳng — 2 quantityAfter khác nhau cho cùng SKU là mâu thuẫn logic, không gộp được.
export async function createAdjustment(actor: Actor, input: CreateAdjustmentInput) {
  if (actor.role !== "ADMIN" && input.warehouseId !== actor.warehouseId) {
    throw new ForbiddenError(
      Message.INVENTORY_ADJUSTMENT.FORBIDDEN_WAREHOUSE.message,
      Message.INVENTORY_ADJUSTMENT.FORBIDDEN_WAREHOUSE.code,
    );
  }

  const warehouse = await adjustmentRepository.findWarehouseById(input.warehouseId);
  if (!warehouse || warehouse.status !== "ACTIVE") {
    throw new NotFoundError(
      Message.INVENTORY_ADJUSTMENT.WAREHOUSE_NOT_FOUND.message,
      Message.INVENTORY_ADJUSTMENT.WAREHOUSE_NOT_FOUND.code,
    );
  }

  const skuIds = input.items.map((item) => item.skuId.toLowerCase());
  const uniqueSkuIds = new Set(skuIds);
  if (uniqueSkuIds.size !== skuIds.length) {
    throw new ConflictError(
      Message.INVENTORY_ADJUSTMENT.DUPLICATE_SKU.message,
      Message.INVENTORY_ADJUSTMENT.DUPLICATE_SKU.code,
    );
  }

  const skus = await adjustmentRepository.findSkusForAdjustment(skuIds);
  if (skus.length !== skuIds.length) {
    const found = new Set(skus.map((sku) => sku.id));
    throw new NotFoundError(
      Message.INVENTORY_ADJUSTMENT.SKU_NOT_FOUND.message,
      Message.INVENTORY_ADJUSTMENT.SKU_NOT_FOUND.code,
      skuIds.filter((skuId) => !found.has(skuId)),
    );
  }

  // LUÔN đòi row Inventory có sẵn — không upsert. Kiểm kê là sửa số đã khai báo, không phải
  // khai báo mới (khác inbound).
  const inventories = await adjustmentRepository.findInventoryForAdjustment(input.warehouseId, skuIds);
  if (inventories.length !== skuIds.length) {
    const declared = new Set(inventories.map((inv) => inv.skuId));
    throw new NotFoundError(
      Message.INVENTORY_ADJUSTMENT.INVENTORY_NOT_FOUND.message,
      Message.INVENTORY_ADJUSTMENT.INVENTORY_NOT_FOUND.code,
      skuIds.filter((skuId) => !declared.has(skuId)),
    );
  }
  const inventoryBySkuId = new Map(inventories.map((inv) => [inv.skuId, inv]));

  return prisma.$transaction(async (tx) => {
    const code = await adjustmentRepository.nextAdjustmentCode(tx);

    return adjustmentRepository.createAdjustmentWithItems(tx, {
      code,
      warehouseId: input.warehouseId,
      reason: input.reason,
      note: input.note ?? null,
      createdByUserId: actor.id,
      items: input.items.map((item) => {
        const inv = inventoryBySkuId.get(item.skuId.toLowerCase())!;
        return {
          skuId: item.skuId,
          quantityBefore: inv.quantityOnHand,
          quantityAfter: item.quantityAfter,
          expectedVersion: inv.version,
        };
      }),
    });
  });
}

// Danh sách phiếu có phân trang — Manager bị ép cứng chỉ xem kho mình
export async function listAdjustments(actor: Actor, query: ListAdjustmentsQuery) {
  const where: Prisma.InventoryAdjustmentWhereInput = {};

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
  if (query.code) {
    where.code = { contains: query.code, mode: "insensitive" };
  }

  const skip = (query.page - 1) * query.limit;

  const [items, total] = await Promise.all([
    adjustmentRepository.findManyAdjustments(where, skip, query.limit),
    adjustmentRepository.countAdjustments(where),
  ]);

  return { items, total };
}

// Xem chi tiết 1 phiếu kèm timeline — không có CUSTOMER trong module này nên timeline luôn hiện
export async function getAdjustmentById(actor: Actor, id: string) {
  const adjustment = await adjustmentRepository.findAdjustmentDetail(id);
  if (!adjustment) {
    throw new NotFoundError(Message.INVENTORY_ADJUSTMENT.NOT_FOUND.message, Message.INVENTORY_ADJUSTMENT.NOT_FOUND.code);
  }

  assertScope(actor, adjustment);

  const timeline = await adjustmentRepository.findAdjustmentTimeline(id);

  const { warehouseId, ...rest } = adjustment;

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

// Hoàn tất kiểm kê — bước DUY NHẤT chạm Inventory, khoá OPTIMISTIC (version), KHÔNG FOR UPDATE.
// Mỗi item check version + reserved trong CÙNG 1 câu UPDATE (xem adjustment.repository.ts) —
// 1 item fail thì rollback toàn bộ phiếu, không áp dụng nửa chừng.
export async function completeAdjustment(actor: Actor, id: string) {
  const adjustment = await adjustmentRepository.findAdjustmentById(id);
  if (!adjustment) {
    throw new NotFoundError(Message.INVENTORY_ADJUSTMENT.NOT_FOUND.message, Message.INVENTORY_ADJUSTMENT.NOT_FOUND.code);
  }

  assertScope(actor, adjustment);

  if (adjustment.status !== "DRAFT") {
    throw new ConflictError(
      Message.INVENTORY_ADJUSTMENT.INVALID_STATUS.message,
      Message.INVENTORY_ADJUSTMENT.INVALID_STATUS.code,
    );
  }

  const updated = await prisma.$transaction(async (tx) => {
    const closed = await adjustmentRepository.completeAdjustmentStatus(tx, id);
    if (closed.count === 0) {
      throw new ConflictError(
        Message.INVENTORY_ADJUSTMENT.INVALID_STATUS.message,
        Message.INVENTORY_ADJUSTMENT.INVALID_STATUS.code,
      );
    }

    const items = await adjustmentRepository.findAdjustmentItems(tx, id);
    const movements: Prisma.InventoryMovementCreateManyInput[] = [];

    for (const item of items) {
      const result = await adjustmentRepository.updateInventoryOptimistic(
        tx,
        adjustment.warehouseId,
        item.skuId,
        item.expectedVersion,
        item.quantityAfter,
      );

      if (!result) {
        // Đọc lại (không khoá) CHỈ để phân biệt lý do — version lệch hay reserved vượt
        const current = await adjustmentRepository.findInventoryRow(adjustment.warehouseId, item.skuId);
        if (!current || current.version !== item.expectedVersion) {
          throw new ConflictError(
            Message.INVENTORY_ADJUSTMENT.VERSION_CONFLICT.message,
            Message.INVENTORY_ADJUSTMENT.VERSION_CONFLICT.code,
            { skuId: item.skuId },
          );
        }
        throw new ConflictError(
          Message.INVENTORY_ADJUSTMENT.BELOW_RESERVED.message,
          Message.INVENTORY_ADJUSTMENT.BELOW_RESERVED.code,
          { skuId: item.skuId, quantityAfter: item.quantityAfter, quantityReserved: current.quantityReserved },
        );
      }

      movements.push({
        inventoryId: result.id,
        createdByUserId: actor.id,
        movementType: "ADJUSTMENT",
        referenceType: "INVENTORY_ADJUSTMENT",
        referenceId: id,
        onHandBefore: item.quantityBefore,
        onHandAfter: item.quantityAfter,
        // reserved không đổi trong UPDATE optimistic ở trên nên trước/sau là cùng 1 giá trị
        reservedBefore: result.quantityReserved,
        reservedAfter: result.quantityReserved,
      });
    }

    await tx.inventoryMovement.createMany({ data: movements });

    await recordStatusChange(tx, {
      documentType: "INVENTORY_ADJUSTMENT",
      documentId: id,
      fromStatus: "DRAFT",
      toStatus: "COMPLETED",
      changedByUserId: actor.id,
    });

    return adjustmentRepository.findAdjustmentWithItems(tx, id);
  });

  return updated!;
}

// Xoá hẳn phiếu còn DRAFT — chưa từng đụng Inventory nên xoá sạch, không phải đổi status
// (enum không có CANCELLED, xem note 9 Business_InventoryAdjustment.md)
export async function deleteAdjustment(actor: Actor, id: string): Promise<void> {
  const adjustment = await adjustmentRepository.findAdjustmentById(id);
  if (!adjustment) {
    throw new NotFoundError(Message.INVENTORY_ADJUSTMENT.NOT_FOUND.message, Message.INVENTORY_ADJUSTMENT.NOT_FOUND.code);
  }

  assertScope(actor, adjustment);

  if (adjustment.status !== "DRAFT") {
    throw new ConflictError(
      Message.INVENTORY_ADJUSTMENT.INVALID_STATUS.message,
      Message.INVENTORY_ADJUSTMENT.INVALID_STATUS.code,
    );
  }

  // Check ở trên chỉ để trả lỗi nhanh cho ca thường — chốt CHỐNG RACE thật nằm trong
  // deleteDraftAdjustment (khoá FOR UPDATE + kiểm lại status trong cùng transaction).
  const deleted = await adjustmentRepository.deleteDraftAdjustment(id);
  if (!deleted) {
    throw new ConflictError(
      Message.INVENTORY_ADJUSTMENT.INVALID_STATUS.message,
      Message.INVENTORY_ADJUSTMENT.INVALID_STATUS.code,
    );
  }
}
