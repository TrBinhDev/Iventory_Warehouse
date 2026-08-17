import { Prisma } from "@prisma/client";
import type { UserRole } from "@prisma/client";
import { prisma } from "../../config/prisma.js";
import { env } from "../../config/env.js";
import { Message } from "../../constants/message.js";
import { BadRequestError, ConflictError, NotFoundError } from "../../errors/appError.js";
import {
  claimIdempotencyKey,
  releaseIdempotencyKey,
} from "../../utils/idempotency.util.js";
import {
  applyInventoryDeltas,
  lockInventoryRows,
} from "../../utils/inventory.core.js";
import { recordStatusChange } from "../../utils/status.core.js";
import { scheduleExpireJob } from "../../queues/reservation.queue.js";
import * as reservationRepository from "./reservation.repository.js";
import type {
  CancelReservationInput,
  CreateReservationInput,
  ListReservationsQuery,
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
      const rows = await lockInventoryRows(tx, input.warehouseId, skuIds);

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

      // Chỉ đụng reserved, onHand giữ nguyên nên không truyền
      await applyInventoryDeltas(
        tx,
        rowBySkuId,
        items.map((item) => ({ skuId: item.skuId, reserved: item.quantity })),
        {
          movementType: "RESERVE",
          referenceType: "RESERVATION",
          referenceId: created.id,
          createdByUserId: actor.id,
        },
      );

      return created;
    });

    // Hẹn giờ nhả hàng — NGOÀI transaction: hẹn bên trong mà rollback thì job vẫn tồn tại và
    // sẽ đi nhả hàng của một phiếu chưa từng ra đời. Đổi lại, commit xong mà Redis chết thì
    // mất job — đó là lý do có cron quét dự phòng.
    await scheduleExpireJob(reservation.id, expiresAt);

    return reservation;
  } catch (err) {
    // Nhả key để khách thử lại ngay được, không thì lỗi hết hàng bị che tới khi key hết TTL
    await releaseIdempotencyKey(key);
    throw err;
  }
}

// Khách chỉ đụng phiếu của mình, Staff/Manager chỉ đụng phiếu kho mình — trả 404 để không lộ
// phiếu có tồn tại. Dùng chung cho cả xem lẫn huỷ: quyền huỷ hẹp hơn (Staff bị loại) nhưng
// việc đó middleware authorize chặn từ route rồi, tới đây chỉ còn câu hỏi phạm vi.
function assertInScope(
  actor: Actor,
  reservation: { customerId: string; warehouseId: string },
): void {
  if (actor.role === "ADMIN") return;

  const inScope =
    actor.role === "CUSTOMER"
      ? reservation.customerId === actor.id
      : reservation.warehouseId === actor.warehouseId;

  if (!inScope) {
    throw new NotFoundError(
      Message.RESERVATION.NOT_FOUND.message,
      Message.RESERVATION.NOT_FOUND.code,
    );
  }
}

// Cộng tổng số lượng và tổng tiền của phiếu — Decimal phải cộng bằng API của nó, không dùng number
function summarize(items: Array<{ quantity: number; unitPrice: Prisma.Decimal }>) {
  return {
    itemCount: items.length,
    totalQuantity: items.reduce((sum, item) => sum + item.quantity, 0),
    totalAmount: items.reduce(
      (sum, item) => sum.add(item.unitPrice.mul(item.quantity)),
      new Prisma.Decimal(0),
    ),
  };
}

// Danh sách phiếu có phân trang — khách thấy phiếu của mình, nhân viên thấy phiếu kho mình
export async function listReservations(actor: Actor, query: ListReservationsQuery) {
  const where: Prisma.ReservationWhereInput = {};

  if (actor.role === "CUSTOMER") {
    where.customerId = actor.id;
    if (query.warehouseId) where.warehouseId = query.warehouseId;
  } else if (actor.role === "ADMIN") {
    if (query.warehouseId) where.warehouseId = query.warehouseId;
  } else {
    // Manager/Staff không gắn kho thì không thấy gì (fail closed), không phải thấy tất cả
    if (!actor.warehouseId) return { items: [], total: 0 };
    where.warehouseId = actor.warehouseId;
  }

  if (query.status) where.status = query.status;
  if (query.code) where.code = { contains: query.code, mode: "insensitive" };

  // Phiếu nào đang giữ SKU này — trả lời câu "onHand 50 mà available 2, ai đang giữ 48 cái kia"
  if (query.skuId) where.items = { some: { skuId: query.skuId } };

  if (query.from || query.to) {
    where.createdAt = {
      ...(query.from ? { gte: query.from } : {}),
      ...(query.to ? { lte: query.to } : {}),
    };
  }

  const skip = (query.page - 1) * query.limit;

  const [rows, total] = await Promise.all([
    reservationRepository.findManyReservations(where, skip, query.limit),
    reservationRepository.countReservations(where),
  ]);

  const items = rows.map(({ items: lines, ...rest }) => ({
    ...rest,
    ...summarize(lines),
  }));

  return { items, total };
}

// Chi tiết 1 phiếu — khách không được thấy tên nhân viên đã huỷ, đó là thông tin nội bộ
export async function getReservationById(actor: Actor, id: string) {
  const reservation = await reservationRepository.findReservationDetail(id);
  if (!reservation) {
    throw new NotFoundError(
      Message.RESERVATION.NOT_FOUND.message,
      Message.RESERVATION.NOT_FOUND.code,
    );
  }

  assertInScope(actor, reservation);

  // Chỉ tra bảng lịch sử khi thật sự cần: phiếu đã huỷ VÀ người xem được phép thấy.
  // Khách xem phiếu đang PENDING là đường phổ biến nhất, đường đó không tốn thêm câu nào.
  const needsCancelActor = reservation.status === "CANCELLED" && actor.role !== "CUSTOMER";
  const cancelledBy = needsCancelActor
    ? await reservationRepository.findCancelActor(id)
    : null;

  // warehouseId/customerId chỉ dùng để check phạm vi, đã có trong warehouse/customer nên bỏ khỏi response
  const { warehouseId, customerId, items, ...rest } = reservation;

  return {
    ...rest,
    ...(actor.role === "CUSTOMER" ? {} : { cancelledBy }),
    items: items.map((item) => ({
      ...item,
      lineTotal: item.unitPrice.mul(item.quantity),
    })),
    ...summarize(items),
  };
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

  assertInScope(actor, reservation);

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

  const updated = await prisma.$transaction(async (tx) => {
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

    // Ai bấm huỷ ghi ở đây thay vì một cột trên Reservation. Đặt SAU chốt count === 0
    // nên phiếu bị người khác đóng trước thì không đẻ dòng lịch sử thừa.
    await recordStatusChange(tx, {
      documentType: "RESERVATION",
      documentId: id,
      fromStatus: "PENDING",
      toStatus: "CANCELLED",
      changedByUserId: actor.id,
    });

    await releaseReservedItems(tx, id, reservation.warehouseId, actor.id);

    return reservationRepository.findReservationWithItems(tx, id);
  });

  // cancelledBy giờ nằm ở bảng lịch sử nên phải đọc thêm 1 câu, chỉ ở đường huỷ (hiếm)
  // để response giữ nguyên hình dạng cũ
  const cancelledBy = await reservationRepository.findCancelActor(id);

  return { ...updated!, cancelledBy };
}

// Nhả toàn bộ reserved của phiếu và ghi audit — dùng chung cho huỷ tay lẫn job hết hạn.
// actorId null nghĩa là hệ thống tự làm (job), không có người nào thao tác.
async function releaseReservedItems(
  tx: Prisma.TransactionClient,
  reservationId: string,
  warehouseId: string,
  actorId: string | null,
): Promise<void> {
  const items = await reservationRepository.findItemsByReservationId(tx, reservationId);
  const skuIds = items.map((item) => item.skuId);

  const rows = await lockInventoryRows(tx, warehouseId, skuIds);
  const rowBySkuId = new Map(rows.map((row) => [row.skuId, row]));

  await applyInventoryDeltas(
    tx,
    rowBySkuId,
    items.map((item) => ({ skuId: item.skuId, reserved: -item.quantity })),
    {
      movementType: "RELEASE",
      referenceType: "RESERVATION",
      referenceId: reservationId,
      createdByUserId: actorId,
    },
  );
}

// Hết hạn phiếu do job chạy nền: KHÔNG throw khi phiếu đã đóng trước đó — khác cancel ở chỗ
// không có ai đọc lỗi, thoát êm là đúng. Trả về có nhả thật hay không để job ghi log.
export async function expireReservation(reservationId: string): Promise<boolean> {
  const reservation = await reservationRepository.findReservationById(reservationId);
  if (!reservation || reservation.status !== "PENDING") return false;

  return prisma.$transaction(async (tx) => {
    const closed = await reservationRepository.markReservationClosed(tx, reservationId, {
      status: "EXPIRED",
      expiredAt: new Date(),
      // cancelledAt để nguyên null — hết hạn khác huỷ về nguồn gốc
    });

    if (closed.count === 0) return false;

    // changedByUserId null: không có người nào bấm. Dòng này không mang thông tin mới so với
    // expiredAt, nhưng thiếu nó thì nhật ký có lỗ và người đọc không biết là chưa ghi hay
    // không xảy ra.
    await recordStatusChange(tx, {
      documentType: "RESERVATION",
      documentId: reservationId,
      fromStatus: "PENDING",
      toStatus: "EXPIRED",
      changedByUserId: null,
    });

    await releaseReservedItems(tx, reservationId, reservation.warehouseId, null);
    return true;
  });
}

// Quét phiếu quá hạn bị job chính bỏ sót (VD Redis restart mất job đã hẹn).
// Mỗi phiếu một transaction riêng: gom hết vào một transaction sẽ khoá quá nhiều dòng
// Inventory cùng lúc và chặn khách đang mua hàng.
export async function sweepExpiredReservations(limit = 100): Promise<number> {
  const candidates = await reservationRepository.findExpiredPendingIds(limit);

  let released = 0;
  for (const candidate of candidates) {
    if (await expireReservation(candidate.id)) released += 1;
  }

  return released;
}
