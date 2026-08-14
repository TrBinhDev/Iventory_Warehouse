import type { Prisma, UserRole } from "@prisma/client";
import { prisma } from "../../config/prisma.js";
import { env } from "../../config/env.js";
import { Message } from "../../constants/message.js";
import { BadRequestError, ConflictError, NotFoundError } from "../../errors/appError.js";
import {
  claimIdempotencyKey,
  releaseIdempotencyKey,
} from "../../utils/idempotency.util.js";
import * as reservationRepository from "./reservation.repository.js";
import type {
  CancelReservationInput,
  CreateReservationInput,
} from "./reservation.schema.js";

interface Actor {
  id: string;
  role: UserRole;
  warehouseId: string | null;
}

interface MergedItem {
  skuId: string;
  quantity: number;
}

// Gộp dòng trùng skuId (hạ chữ thường vì UUID nhận cả chữ hoa) rồi sort cho kết quả ổn định
function mergeItems(items: CreateReservationInput["items"]): MergedItem[] {
  const merged = new Map<string, number>();

  for (const item of items) {
    const skuId = item.skuId.toLowerCase();
    merged.set(skuId, (merged.get(skuId) ?? 0) + item.quantity);
  }

  return [...merged.entries()]
    .map(([skuId, quantity]) => ({ skuId, quantity }))
    .sort((a, b) => a.skuId.localeCompare(b.skuId));
}

// Tạo phiếu giữ chỗ: khoá tồn → kiểm đủ hàng → tăng reserved → tạo phiếu → ghi audit, trong 1 transaction
export async function createReservation(
  actor: Actor,
  input: CreateReservationInput,
  idempotencyKey: string,
) {
  // Claim đặt ngoài try: để trong thì lúc claim ném DUPLICATE, catch sẽ xoá key của request đầu đang chạy
  const key = await claimIdempotencyKey(
    actor.id,
    idempotencyKey,
    Message.RESERVATION.DUPLICATE_REQUEST,
  );

  try {
    const items = mergeItems(input.items);
    const skuIds = items.map((item) => item.skuId);

    const warehouse = await reservationRepository.findWarehouseById(input.warehouseId);
    if (!warehouse || warehouse.status !== "ACTIVE") {
      throw new NotFoundError(
        Message.RESERVATION.WAREHOUSE_NOT_FOUND.message,
        Message.RESERVATION.WAREHOUSE_NOT_FOUND.code,
      );
    }

    const skus = await reservationRepository.findSkusForReservation(skuIds);

    if (skus.length !== skuIds.length) {
      const found = new Set(skus.map((sku) => sku.id));
      throw new NotFoundError(
        Message.RESERVATION.SKU_NOT_FOUND.message,
        Message.RESERVATION.SKU_NOT_FOUND.code,
        skuIds.filter((skuId) => !found.has(skuId)),
      );
    }

    const inactive = skus.filter(
      (sku) => sku.status !== "ACTIVE" || sku.product.status !== "ACTIVE",
    );
    if (inactive.length > 0) {
      throw new BadRequestError(
        Message.RESERVATION.SKU_INACTIVE.message,
        Message.RESERVATION.SKU_INACTIVE.code,
        inactive.map((sku) => sku.id),
      );
    }

    const priceBySkuId = new Map(skus.map((sku) => [sku.id, sku.price]));
    const expiresAt = new Date(Date.now() + env.RESERVATION_TTL_MINUTES * 60_000);

    const reservation = await prisma.$transaction(async (tx) => {
      const rows = await reservationRepository.lockInventories(
        tx,
        input.warehouseId,
        skuIds,
      );

      // Không lazy-create: kho chưa khai báo tồn cho SKU thì không giữ chỗ được
      if (rows.length !== items.length) {
        const declared = new Set(rows.map((row) => row.skuId));
        throw new NotFoundError(
          Message.RESERVATION.INVENTORY_NOT_FOUND.message,
          Message.RESERVATION.INVENTORY_NOT_FOUND.code,
          skuIds.filter((skuId) => !declared.has(skuId)),
        );
      }

      const rowBySkuId = new Map(rows.map((row) => [row.skuId, row]));

      const shortages = items
        .map((item) => {
          const row = rowBySkuId.get(item.skuId)!;
          return {
            skuId: item.skuId,
            requested: item.quantity,
            available: row.quantityOnHand - row.quantityReserved,
          };
        })
        .filter((entry) => entry.available < entry.requested);

      // Thiếu ở bất kỳ SKU nào là rollback cả phiếu, không giữ chỗ một phần
      if (shortages.length > 0) {
        throw new ConflictError(
          Message.RESERVATION.OUT_OF_STOCK.message,
          Message.RESERVATION.OUT_OF_STOCK.code,
          shortages,
        );
      }

      for (const item of items) {
        const row = rowBySkuId.get(item.skuId)!;
        await reservationRepository.increaseReserved(tx, row.id, item.quantity);
      }

      const code = await reservationRepository.nextReservationCode(tx);

      const created = await reservationRepository.createReservationWithItems(tx, {
        code,
        warehouseId: input.warehouseId,
        customerId: actor.id,
        expiresAt,
        items: items.map((item) => ({
          skuId: item.skuId,
          quantity: item.quantity,
          unitPrice: priceBySkuId.get(item.skuId)!,
        })),
      });

      // onHand before = after vì giữ chỗ chỉ đụng reserved
      const movements: Prisma.InventoryMovementCreateManyInput[] = items.map((item) => {
        const row = rowBySkuId.get(item.skuId)!;
        return {
          inventoryId: row.id,
          createdByUserId: actor.id,
          movementType: "RESERVE",
          referenceType: "RESERVATION",
          referenceId: created.id,
          onHandBefore: row.quantityOnHand,
          onHandAfter: row.quantityOnHand,
          reservedBefore: row.quantityReserved,
          reservedAfter: row.quantityReserved + item.quantity,
        };
      });

      await reservationRepository.createMovements(tx, movements);

      return created;
    });

    // TODO(R9): schedule BullMQ job nhả reserved lúc expiresAt — phải ngoài transaction
    return reservation;
  } catch (err) {
    // Nhả key để khách thử lại ngay được, không thì lỗi hết hàng bị che tới khi key hết TTL
    await releaseIdempotencyKey(key);
    throw err;
  }
}

// Khách chỉ đụng phiếu của mình, Manager chỉ đụng phiếu kho mình — trả 404 để không lộ phiếu có tồn tại
function assertCanCancel(
  actor: Actor,
  reservation: { customerId: string; warehouseId: string },
): void {
  if (actor.role === "ADMIN") return;

  const owned =
    actor.role === "CUSTOMER"
      ? reservation.customerId === actor.id
      : reservation.warehouseId === actor.warehouseId;

  if (!owned) {
    throw new NotFoundError(
      Message.RESERVATION.NOT_FOUND.message,
      Message.RESERVATION.NOT_FOUND.code,
    );
  }
}

// Huỷ phiếu và nhả hàng về bán tiếp ngay, không phải chờ hết hạn
export async function cancelReservation(
  actor: Actor,
  id: string,
  input: CancelReservationInput,
) {
  const reservation = await reservationRepository.findReservationById(id);
  if (!reservation) {
    throw new NotFoundError(
      Message.RESERVATION.NOT_FOUND.message,
      Message.RESERVATION.NOT_FOUND.code,
    );
  }

  assertCanCancel(actor, reservation);

  // Nhân viên huỷ đơn người khác thì phải giải trình; khách tự huỷ thì customerId đã nói ai làm
  if (actor.role !== "CUSTOMER" && !input.cancelReason) {
    throw new BadRequestError(
      Message.RESERVATION.CANCEL_REASON_REQUIRED.message,
      Message.RESERVATION.CANCEL_REASON_REQUIRED.code,
    );
  }

  // Chốt SỚM: báo lỗi cho ca thường mà không phải mở transaction. Miễn phí vì bản ghi đã đọc
  // sẵn ở trên để làm 404 + ABAC. Đây KHÔNG phải chốt chống race — chốt đó nằm trong updateMany
  // dưới transaction, đừng thấy trùng mà xoá cái nào.
  if (reservation.status !== "PENDING") {
    throw new ConflictError(
      Message.RESERVATION.INVALID_STATUS.message,
      Message.RESERVATION.INVALID_STATUS.code,
    );
  }

  return prisma.$transaction(async (tx) => {
    // Chốt CHỐNG RACE (bắt buộc, không được bỏ): đổi status là ĐIỀU KIỆN chứ không phải hệ quả.
    // 0 dòng nghĩa là job hết hạn hoặc một request huỷ khác đã xử lý xong trước. Không có chốt
    // này thì reserved bị trừ 2 lần, available phình ảo và bán vượt số hàng thật có.
    const closed = await reservationRepository.markReservationClosed(tx, id, {
      status: "CANCELLED",
      cancelledAt: new Date(),
      cancelReason: input.cancelReason ?? null,
    });

    if (closed.count === 0) {
      throw new ConflictError(
        Message.RESERVATION.INVALID_STATUS.message,
        Message.RESERVATION.INVALID_STATUS.code,
      );
    }

    const items = await reservationRepository.findItemsByReservationId(tx, id);
    const skuIds = [...items].map((item) => item.skuId).sort((a, b) => a.localeCompare(b));

    // Khoá cùng thứ tự với lúc tạo phiếu (ORDER BY "skuId") để 2 luồng không ôm chéo lock
    const rows = await reservationRepository.lockInventories(
      tx,
      reservation.warehouseId,
      skuIds,
    );
    const rowBySkuId = new Map(rows.map((row) => [row.skuId, row]));

    const movements: Prisma.InventoryMovementCreateManyInput[] = [];

    for (const item of items) {
      const row = rowBySkuId.get(item.skuId)!;
      await reservationRepository.decreaseReserved(tx, row.id, item.quantity);

      movements.push({
        inventoryId: row.id,
        createdByUserId: actor.id,
        movementType: "RELEASE",
        referenceType: "RESERVATION",
        referenceId: id,
        onHandBefore: row.quantityOnHand,
        onHandAfter: row.quantityOnHand,
        reservedBefore: row.quantityReserved,
        reservedAfter: row.quantityReserved - item.quantity,
      });
    }

    await reservationRepository.createMovements(tx, movements);

    return reservationRepository.findReservationWithItems(tx, id);
  });
}
