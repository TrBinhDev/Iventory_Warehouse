import { Prisma } from "@prisma/client";
import type { UserRole } from "@prisma/client";
import { prisma } from "../../config/prisma.js";
import { Message } from "../../constants/message.js";
import { BadRequestError, ConflictError, NotFoundError } from "../../errors/appError.js";
import {
  claimIdempotencyKey,
  releaseIdempotencyKey,
} from "../../utils/idempotency.util.js";
import { applyInventoryDeltas, lockInventoryRows } from "../../utils/inventory.core.js";
import { normalizePhone } from "../../utils/phone.util.js";
import { recordStatusChange } from "../../utils/status.core.js";
import * as salesOrderRepository from "./sales-order.repository.js";
import type {
  CancelSalesOrderInput,
  CreateFromReservationInput,
  CreateSalesOrderInput,
  ListSalesOrdersQuery,
} from "./sales-order.schema.js";

interface Actor {
  id: string;
  role: UserRole;
  warehouseId: string | null;
}

interface OrderLine {
  skuId: string;
  quantity: number;
  unitPrice: Prisma.Decimal;
}

// Gộp dòng trùng skuId (hạ chữ thường vì UUID nhận cả chữ hoa) rồi sort cho kết quả ổn định
function mergeItems(items: CreateSalesOrderInput["items"]) {
  const merged = new Map<string, number>();

  for (const item of items) {
    const skuId = item.skuId.toLowerCase();
    merged.set(skuId, (merged.get(skuId) ?? 0) + item.quantity);
  }

  return [...merged.entries()]
    .map(([skuId, quantity]) => ({ skuId, quantity }))
    .sort((a, b) => a.skuId.localeCompare(b.skuId));
}

// Cộng tổng tiền — Decimal phải cộng bằng API của nó, không dùng number
function sumAmount(lines: OrderLine[]): Prisma.Decimal {
  return lines.reduce(
    (sum, line) => sum.add(line.unitPrice.mul(line.quantity)),
    new Prisma.Decimal(0),
  );
}

// Phần chung của 2 luồng tạo đơn: sinh mã, tính tổng tiền, INSERT đơn + item.
// totalAmount luôn tính ở đây từ unitPrice × quantity, không bao giờ nhận từ client.
async function insertOrder(
  tx: Prisma.TransactionClient,
  data: {
    warehouseId: string;
    customerId: string;
    reservationId: string | null;
    lines: OrderLine[];
  },
) {
  const code = await salesOrderRepository.nextSalesOrderCode(tx);

  return salesOrderRepository.createSalesOrderWithItems(tx, {
    code,
    warehouseId: data.warehouseId,
    customerId: data.customerId,
    reservationId: data.reservationId,
    totalAmount: sumAmount(data.lines),
    items: data.lines,
  });
}

// Khách chỉ đụng đơn của mình, Manager chỉ đụng đơn kho mình — trả 404 để không lộ đơn có
// tồn tại ở kho khác. Staff bị chặn từ route nên tới đây chỉ còn câu hỏi phạm vi.
function assertInScope(
  actor: Actor,
  order: { customerId: string; warehouseId: string },
): void {
  if (actor.role === "ADMIN") return;

  const inScope =
    actor.role === "CUSTOMER"
      ? order.customerId === actor.id
      : order.warehouseId === actor.warehouseId;

  if (!inScope) {
    throw new NotFoundError(
      Message.SALES_ORDER.NOT_FOUND.message,
      Message.SALES_ORDER.NOT_FOUND.code,
    );
  }
}

// LUỒNG A — mua thẳng: khoá tồn → kiểm đủ hàng → tăng reserved → tạo đơn, trong 1 transaction.
// Cùng hình dạng với createReservation vì cùng bản chất: giữ hàng lại cho một người.
export async function createSalesOrder(
  actor: Actor,
  input: CreateSalesOrderInput,
  idempotencyKey: string,
) {
  // Claim đặt ngoài try: để trong thì lúc claim ném DUPLICATE, catch sẽ xoá key của request đầu đang chạy
  const key = await claimIdempotencyKey(
    actor.id,
    idempotencyKey,
    Message.SALES_ORDER.DUPLICATE_REQUEST,
  );

  try {
    const items = mergeItems(input.items);
    const skuIds = items.map((item) => item.skuId);

    const warehouse = await salesOrderRepository.findWarehouseById(input.warehouseId);
    if (!warehouse || warehouse.status !== "ACTIVE") {
      throw new NotFoundError(
        Message.SALES_ORDER.WAREHOUSE_NOT_FOUND.message,
        Message.SALES_ORDER.WAREHOUSE_NOT_FOUND.code,
      );
    }

    const skus = await salesOrderRepository.findSkusForSalesOrder(skuIds);

    if (skus.length !== skuIds.length) {
      const found = new Set(skus.map((sku) => sku.id));
      throw new NotFoundError(
        Message.SALES_ORDER.SKU_NOT_FOUND.message,
        Message.SALES_ORDER.SKU_NOT_FOUND.code,
        skuIds.filter((skuId) => !found.has(skuId)),
      );
    }

    const inactive = skus.filter(
      (sku) => sku.status !== "ACTIVE" || sku.product.status !== "ACTIVE",
    );
    if (inactive.length > 0) {
      throw new BadRequestError(
        Message.SALES_ORDER.SKU_INACTIVE.message,
        Message.SALES_ORDER.SKU_INACTIVE.code,
        inactive.map((sku) => sku.id),
      );
    }

    const priceBySkuId = new Map(skus.map((sku) => [sku.id, sku.price]));

    return await prisma.$transaction(async (tx) => {
      const rows = await lockInventoryRows(tx, input.warehouseId, skuIds);

      // Không lazy-create: kho chưa khai báo tồn cho SKU thì không đặt mua được
      if (rows.length !== items.length) {
        const declared = new Set(rows.map((row) => row.skuId));
        throw new NotFoundError(
          Message.SALES_ORDER.INVENTORY_NOT_FOUND.message,
          Message.SALES_ORDER.INVENTORY_NOT_FOUND.code,
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

      // Thiếu ở bất kỳ SKU nào là rollback cả đơn, không bán một phần
      if (shortages.length > 0) {
        throw new ConflictError(
          Message.SALES_ORDER.OUT_OF_STOCK.message,
          Message.SALES_ORDER.OUT_OF_STOCK.code,
          shortages,
        );
      }

      const created = await insertOrder(tx, {
        warehouseId: input.warehouseId,
        customerId: actor.id,
        reservationId: null,
        lines: items.map((item) => ({
          skuId: item.skuId,
          quantity: item.quantity,
          unitPrice: priceBySkuId.get(item.skuId)!,
        })),
      });

      // Chỉ đụng reserved. onHand chỉ giảm khi xuất kho thật, việc đó thuộc module outbound.
      await applyInventoryDeltas(
        tx,
        rowBySkuId,
        items.map((item) => ({ skuId: item.skuId, reserved: item.quantity })),
        {
          movementType: "RESERVE",
          referenceType: "SALES_ORDER",
          referenceId: created.id,
          createdByUserId: actor.id,
        },
      );

      return created;
    });
  } catch (err) {
    // Nhả key để khách thử lại ngay được, không thì lỗi hết hàng bị che tới khi key hết TTL
    await releaseIdempotencyKey(key);
    throw err;
  }
}

// LUỒNG B — đặt mua từ phiếu giữ chỗ có sẵn.
//
// KHÔNG chạm bảng Inventory một dòng nào: hàng đã nằm trong reserved từ lúc tạo phiếu, chuyển
// thành đơn chỉ là đổi lý do bị giữ. Nếu thấy lockInventoryRows/applyInventoryDeltas xuất hiện
// trong hàm này là sai — reserved sẽ thành gấp đôi cho cùng một lượng hàng.
//
// Cũng KHÔNG đọc bảng SKU: giá lấy từ ReservationItem.unitPrice đã chốt lúc giữ chỗ. Hệ quả có
// chủ ý là SKU bị cho ngừng kinh doanh giữa chừng vẫn đặt mua được — hàng đã giữ vật lý cho
// khách rồi, chặn ở bước cuối chỉ làm khách bực mà kho vẫn phải nhả hàng.
export async function createSalesOrderFromReservation(
  actor: Actor,
  input: CreateFromReservationInput,
  idempotencyKey: string,
) {
  const key = await claimIdempotencyKey(
    actor.id,
    idempotencyKey,
    Message.SALES_ORDER.DUPLICATE_REQUEST,
  );

  try {
    const reservation = await salesOrderRepository.findReservationForConvert(
      input.reservationId,
    );

    // 404 chứ không 403 khi phiếu của người khác — không lộ ra là phiếu đó có tồn tại
    if (!reservation || reservation.customerId !== actor.id) {
      throw new NotFoundError(
        Message.SALES_ORDER.RESERVATION_NOT_FOUND.message,
        Message.SALES_ORDER.RESERVATION_NOT_FOUND.code,
      );
    }

    // Chốt SỚM: báo lỗi cho ca thường mà không phải mở transaction. Bản ghi đã đọc sẵn ở trên
    // để làm 404 nên miễn phí. KHÔNG phải chốt chống race — chốt đó nằm trong confirmReservation.
    if (reservation.status !== "PENDING") {
      throw new ConflictError(
        Message.SALES_ORDER.RESERVATION_INVALID_STATUS.message,
        Message.SALES_ORDER.RESERVATION_INVALID_STATUS.code,
      );
    }

    return await prisma.$transaction(async (tx) => {
      // Chốt CHỐNG RACE: đổi status là ĐIỀU KIỆN chứ không phải hệ quả. 0 dòng nghĩa là job hết
      // hạn hoặc một request khác đã xử lý xong trước. Không có chốt này thì 2 request cùng bấm
      // sẽ đẻ 2 đơn cho cùng một phiếu.
      const confirmed = await salesOrderRepository.confirmReservation(tx, reservation.id);

      if (confirmed.count === 0) {
        throw new ConflictError(
          Message.SALES_ORDER.RESERVATION_INVALID_STATUS.message,
          Message.SALES_ORDER.RESERVATION_INVALID_STATUS.code,
        );
      }

      // Đặt sau chốt count === 0 nên phiếu bị người khác đóng trước không đẻ dòng lịch sử thừa
      await recordStatusChange(tx, {
        documentType: "RESERVATION",
        documentId: reservation.id,
        fromStatus: "PENDING",
        toStatus: "CONFIRMED",
        changedByUserId: actor.id,
      });

      const lines = await salesOrderRepository.findReservationItems(tx, reservation.id);

      return insertOrder(tx, {
        warehouseId: reservation.warehouseId,
        customerId: actor.id,
        reservationId: reservation.id,
        lines,
      });
    });
  } catch (err) {
    await releaseIdempotencyKey(key);

    // Lưới đỡ cuối cho luật "1 phiếu 1 đơn". Đường bình thường không tới được đây vì
    // confirmReservation đã chặn ở trên; chỉ bật khi code sau này viết sai. Đổi P2002 thành 409
    // có nghĩa thay vì để lọt thành 500.
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      throw new ConflictError(
        Message.SALES_ORDER.RESERVATION_ALREADY_CONVERTED.message,
        Message.SALES_ORDER.RESERVATION_ALREADY_CONVERTED.code,
      );
    }

    throw err;
  }
}

// Danh sách đơn có phân trang — khách thấy đơn của mình, nhân viên thấy đơn kho mình.
// warehouseId trong query chỉ có tác dụng với ADMIN; Manager/Staff gửi lên cũng bị ghi đè
// bằng kho của chính họ, không phải bị báo lỗi.
export async function listSalesOrders(actor: Actor, query: ListSalesOrdersQuery) {
  const where: Prisma.SalesOrderWhereInput = {};

  if (actor.role === "CUSTOMER") {
    where.customerId = actor.id;
    if (query.warehouseId) where.warehouseId = query.warehouseId;
  } else {
    if (actor.role === "ADMIN") {
      if (query.warehouseId) where.warehouseId = query.warehouseId;
    } else {
      // Manager/Staff không gắn kho thì không thấy gì (fail closed), không phải thấy tất cả
      if (!actor.warehouseId) return { items: [], total: 0 };
      where.warehouseId = actor.warehouseId;
    }

    // Chỉ nhân viên mới lọc theo khách. Đặt trong nhánh này chứ không đặt chung phía dưới:
    // để chung thì khách gửi customerId của người khác sẽ GHI ĐÈ where.customerId vừa ép ở
    // trên và xem được đơn người ta.
    if (query.customerId) where.customerId = query.customerId;

    // Một ô tìm kiếm cho 3 cột: nhân viên nghe điện thoại có gì gõ nấy, không phải chọn
    // trước là đang tra bằng tên hay email hay số máy.
    if (query.customer) {
      // Nhánh sđt so bằng chuỗi ĐÃ CHUẨN HOÁ, không so nguyên văn: dưới DB số luôn ở dạng
      // 0xxxxxxxxx (xem phone.util.ts), nên gõ "090 123 4567" hay "+84901234567" phải quy về
      // cùng dạng mới khớp. Gõ chữ thì normalizePhone trả rỗng -> bỏ hẳn nhánh này đi.
      const phoneQuery = normalizePhone(query.customer);

      where.customer = {
        OR: [
          { fullName: { contains: query.customer, mode: "insensitive" } },
          { email: { contains: query.customer, mode: "insensitive" } },
          ...(phoneQuery ? [{ phone: { contains: phoneQuery } }] : []),
        ],
      };
    }
  }

  if (query.status) where.status = query.status;
  if (query.code) where.code = { contains: query.code, mode: "insensitive" };

  // Đơn nào đang giữ SKU này. Cùng vai trò với filter cùng tên bên reservation: từ khi có
  // module này, hàng bị giữ nằm ở CẢ HAI chỗ nên phải tra được cả hai mới ra đủ.
  if (query.skuId) where.items = { some: { skuId: query.skuId } };

  // Lọc theo ngày tạo — đây là thứ thay cho TTL đơn chưa thanh toán: nhân viên lọc
  // status=PENDING kèm to=<ngày> là ra hết đơn cũ bị bỏ ngang, huỷ hàng loạt.
  if (query.from || query.to) {
    where.createdAt = {
      ...(query.from ? { gte: query.from } : {}),
      ...(query.to ? { lte: query.to } : {}),
    };
  }

  const skip = (query.page - 1) * query.limit;

  const [rows, total] = await Promise.all([
    salesOrderRepository.findManySalesOrders(where, skip, query.limit),
    salesOrderRepository.countSalesOrders(where),
  ]);

  const items = rows.map(({ items: lines, ...rest }) => ({
    ...rest,
    itemCount: lines.length,
    totalQuantity: lines.reduce((sum, line) => sum + line.quantity, 0),
  }));

  return { items, total };
}

// Chi tiết 1 đơn. Khách KHÔNG được thấy timeline vì trong đó có tên nhân viên — thông tin nội
// bộ, cùng lý do reservation ẩn cancelledBy. Khách không mất gì: các mốc paidAt/confirmedAt/
// cancelledAt/refundedAt vẫn nằm trên đơn nên vẫn biết đơn đi tới đâu, lúc nào.
export async function getSalesOrderById(actor: Actor, id: string) {
  const order = await salesOrderRepository.findSalesOrderDetail(id);
  if (!order) {
    throw new NotFoundError(
      Message.SALES_ORDER.NOT_FOUND.message,
      Message.SALES_ORDER.NOT_FOUND.code,
    );
  }

  assertInScope(actor, order);

  const isCustomer = actor.role === "CUSTOMER";

  // Chỉ tra bảng lịch sử khi người xem được phép thấy — khách xem đơn của mình là đường phổ
  // biến nhất, đường đó không tốn thêm câu nào.
  const timeline = isCustomer ? [] : await salesOrderRepository.findSalesOrderTimeline(id);

  // warehouseId/customerId chỉ dùng để check phạm vi, đã có trong warehouse/customer nên bỏ đi
  const { warehouseId, customerId, items, ...rest } = order;

  return {
    ...rest,
    ...(isCustomer
      ? {}
      : {
          timeline: timeline.map((row) => ({
            fromStatus: row.fromStatus,
            toStatus: row.toStatus,
            note: row.note,
            changedAt: row.createdAt,
            changedBy: row.changedBy,
          })),
        }),
    items: items.map((item) => ({
      ...item,
      lineTotal: item.unitPrice.mul(item.quantity),
    })),
    itemCount: items.length,
    totalQuantity: items.reduce((sum, item) => sum + item.quantity, 0),
  };
}

// Trạng thái nào huỷ được, tuỳ người bấm. Khách chỉ huỷ khi chưa có tiền vào; từ lúc đã thu
// tiền thì phải có người của kho đứng tên — cùng lý lẽ với việc chốt pay là Manager.
// COMPLETED không nằm trong cả hai danh sách: hàng đã xuất kho rồi, muốn lấy lại phải làm
// phiếu Inbound với lý do CUSTOMER_RETURN, không phải huỷ đơn.
const CANCELLABLE_BY_CUSTOMER = ["PENDING"] as const;
const CANCELLABLE_BY_STAFF = ["PENDING", "PAID", "CONFIRMED"] as const;

// Huỷ đơn và nhả reserved về bán tiếp ngay.
//
// Một endpoint hai kết quả: đơn chưa thu tiền thành CANCELLED, đơn đã thu tiền thành REFUNDED.
// Tác động tồn kho y hệt nhau (nhả reserved), chỉ khác nghĩa kế toán — gộp hết thành CANCELLED
// thì mất dấu khoản phải hoàn, tách 2 endpoint thì người gọi phải tự đoán đơn đang ở đâu.
export async function cancelSalesOrder(
  actor: Actor,
  id: string,
  input: CancelSalesOrderInput,
) {
  const order = await salesOrderRepository.findSalesOrderById(id);
  if (!order) {
    throw new NotFoundError(
      Message.SALES_ORDER.NOT_FOUND.message,
      Message.SALES_ORDER.NOT_FOUND.code,
    );
  }

  assertInScope(actor, order);

  // Nhân viên huỷ đơn người khác thì phải giải trình; khách tự huỷ thì customerId đã nói ai làm
  if (actor.role !== "CUSTOMER" && !input.cancelReason) {
    throw new BadRequestError(
      Message.SALES_ORDER.CANCEL_REASON_REQUIRED.message,
      Message.SALES_ORDER.CANCEL_REASON_REQUIRED.code,
    );
  }

  const allowed: readonly string[] =
    actor.role === "CUSTOMER" ? CANCELLABLE_BY_CUSTOMER : CANCELLABLE_BY_STAFF;

  // Chốt SỚM: báo lỗi cho ca thường mà không phải mở transaction. Bản ghi đã đọc sẵn ở trên nên
  // miễn phí. KHÔNG phải chốt chống race — chốt đó nằm trong markSalesOrderClosed dưới đây.
  if (!allowed.includes(order.status)) {
    throw new ConflictError(
      Message.SALES_ORDER.INVALID_STATUS.message,
      Message.SALES_ORDER.INVALID_STATUS.code,
    );
  }

  // Đã thu tiền thì huỷ là phải hoàn — trạng thái khác nhau vì nghĩa kế toán khác nhau
  const closedAt = new Date();
  const targetStatus = order.status === "PENDING" ? "CANCELLED" : "REFUNDED";

  const updated = await prisma.$transaction(async (tx) => {
    // Chốt CHỐNG RACE (bắt buộc): khoá theo ĐÚNG trạng thái đã đọc, không phải theo danh sách.
    // Khoá theo danh sách thì đơn PENDING bị Manager khác chuyển sang PAID xen giữa vẫn khớp,
    // và ta sẽ ghi CANCELLED cho một đơn đã thu tiền. 0 dòng nghĩa là người khác xử lý trước.
    const closed = await salesOrderRepository.markSalesOrderClosed(tx, id, order.status, {
      status: targetStatus,
      cancelReason: input.cancelReason ?? null,
      // Chỉ set đúng một mốc thời gian khớp với trạng thái đích, không set cả hai —
      // cùng cách reservation tách cancelledAt với expiredAt theo nguồn gốc.
      ...(targetStatus === "CANCELLED" ? { cancelledAt: closedAt } : { refundedAt: closedAt }),
    });

    if (closed.count === 0) {
      throw new ConflictError(
        Message.SALES_ORDER.INVALID_STATUS.message,
        Message.SALES_ORDER.INVALID_STATUS.code,
      );
    }

    // Đặt sau chốt count === 0 nên đơn bị người khác đóng trước không đẻ dòng lịch sử thừa
    await recordStatusChange(tx, {
      documentType: "SALES_ORDER",
      documentId: id,
      fromStatus: order.status,
      toStatus: targetStatus,
      changedByUserId: actor.id,
    });

    const lines = await salesOrderRepository.findSalesOrderItems(tx, id);
    const skuIds = lines.map((line) => line.skuId);

    const rows = await lockInventoryRows(tx, order.warehouseId, skuIds);
    const rowBySkuId = new Map(rows.map((row) => [row.skuId, row]));

    // Nhả reserved. onHand không đụng vì đơn chưa từng trừ onHand — hàng vẫn nằm trong kho.
    await applyInventoryDeltas(
      tx,
      rowBySkuId,
      lines.map((line) => ({ skuId: line.skuId, reserved: -line.quantity })),
      {
        movementType: "RELEASE",
        referenceType: "SALES_ORDER",
        referenceId: id,
        createdByUserId: actor.id,
      },
    );

    return salesOrderRepository.findSalesOrderWithItems(tx, id);
  });

  return updated!;
}
