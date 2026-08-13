import type { Prisma, UserRole } from "@prisma/client";
import { ConflictError, ForbiddenError, NotFoundError } from "../../errors/appError.js";
import { Message } from "../../constants/message.js";
import { withAvailable } from "../../utils/inventory.util.js";
import { assertNoReferences } from "../../utils/reference.util.js";
import * as inventoryRepository from "./inventory.repository.js";
import type {
  AvailabilityQuery,
  CreateInventoryInput,
  ListInventoriesQuery,
} from "./inventory.schema.js";

// Manager/Staff chỉ được đụng dòng tồn thuộc kho mình. Trả NotFound (không phải Forbidden)
// để không lộ ra rằng dòng đó có tồn tại ở kho khác — cùng cách làm với module user.
function assertCanAccess(actor: Actor, warehouseId: string) {
  if (actor.role === "ADMIN") return;
  if (actor.warehouseId !== warehouseId) {
    throw new NotFoundError(Message.INVENTORY.NOT_FOUND.message, Message.INVENTORY.NOT_FOUND.code);
  }
}

interface Actor {
  id: string;
  role: UserRole;
  warehouseId: string | null;
}

// Khởi tạo dòng tồn kho cho 1 cặp kho + SKU — khai báo trước khi nhập hàng lần đầu.
// Admin làm được cho mọi kho, Manager chỉ cho đúng kho mình quản lý (ABAC).
export async function createInventory(actor: Actor, input: CreateInventoryInput) {
  if (actor.role === "WAREHOUSE_MANAGER" && input.warehouseId !== actor.warehouseId) {
    throw new ForbiddenError(
      Message.INVENTORY.FORBIDDEN_WAREHOUSE.message,
      Message.INVENTORY.FORBIDDEN_WAREHOUSE.code
    );
  }

  const warehouse = await inventoryRepository.findWarehouseById(input.warehouseId);
  if (!warehouse) {
    throw new NotFoundError(
      Message.INVENTORY.WAREHOUSE_NOT_FOUND.message,
      Message.INVENTORY.WAREHOUSE_NOT_FOUND.code
    );
  }

  const sku = await inventoryRepository.findSkuById(input.skuId);
  if (!sku) {
    throw new NotFoundError(
      Message.INVENTORY.SKU_NOT_FOUND.message,
      Message.INVENTORY.SKU_NOT_FOUND.code
    );
  }

  const existing = await inventoryRepository.findByWarehouseAndSku(input.warehouseId, input.skuId);
  if (existing) {
    throw new ConflictError(
      Message.INVENTORY.ALREADY_EXISTS.message,
      Message.INVENTORY.ALREADY_EXISTS.code
    );
  }

  const inventory = await inventoryRepository.createInventory(input);
  return withAvailable(inventory);
}

// Danh sách tồn kho có phân trang — Manager/Staff bị ép cứng chỉ xem kho mình,
// warehouseId họ gửi lên bị bỏ qua (không phải lỗi, chỉ đơn giản là không có tác dụng)
export async function listInventories(actor: Actor, query: ListInventoriesQuery) {
  const where: Prisma.InventoryWhereInput = {};

  if (actor.role === "ADMIN") {
    if (query.warehouseId) {
      where.warehouseId = query.warehouseId;
    }
  } else {
    // Manager/Staff: nếu vì lý do nào đó không gắn kho thì không thấy gì (fail closed), không thấy tất cả
    where.warehouseId = actor.warehouseId ?? undefined;
    if (!actor.warehouseId) {
      return { items: [], total: 0 };
    }
  }

  if (query.skuId) {
    where.skuId = query.skuId;
  }

  if (query.search) {
    where.OR = [
      { sku: { skuCode: { contains: query.search, mode: "insensitive" } } },
      { sku: { product: { name: { contains: query.search, mode: "insensitive" } } } },
    ];
  }

  const skip = (query.page - 1) * query.limit;

  const [rows, total] = await Promise.all([
    inventoryRepository.findMany(where, skip, query.limit),
    inventoryRepository.count(where),
  ]);

  return { items: rows.map(withAvailable), total };
}

// Xem chi tiết 1 dòng tồn kho — Manager/Staff chỉ xem được dòng thuộc kho mình
export async function getInventoryById(actor: Actor, id: string) {
  const inventory = await inventoryRepository.findById(id);
  if (!inventory) {
    throw new NotFoundError(Message.INVENTORY.NOT_FOUND.message, Message.INVENTORY.NOT_FOUND.code);
  }

  assertCanAccess(actor, inventory.warehouseId);

  return withAvailable(inventory);
}

// Xoá hẳn dòng tồn kho — Admin only, chỉ cho xoá khi chưa có biến động nào.
// Dùng cho ca khai báo nhầm cặp kho + SKU rồi chưa dùng tới. Đã từng nhập/xuất thì chặn,
// kể cả khi số lượng hiện tại đã về 0 — vì xoá đi là mất dấu lịch sử.
export async function deleteInventory(id: string) {
  const existing = await inventoryRepository.findById(id);
  if (!existing) {
    throw new NotFoundError(Message.INVENTORY.NOT_FOUND.message, Message.INVENTORY.NOT_FOUND.code);
  }

  const movementCount = await inventoryRepository.countMovements(id);
  assertNoReferences(
    [{ resource: "inventoryMovement", label: "biến động tồn kho", count: movementCount }],
    Message.INVENTORY.IN_USE
  );

  await inventoryRepository.deleteInventory(id);
}

// API public (trang khách): SKU này còn đặt được bao nhiêu, ở kho nào.
// Chỉ trả available — KHÔNG lộ onHand/reserved vì đó là số nội bộ (đối thủ suy ra được
// lượng hàng và tốc độ bán). Không trả tổng các kho vì Reservation chỉ giữ chỗ từ 1 kho,
// không gom chéo kho, nên con số tổng là con số nghiệp vụ không dùng được.
export async function getAvailability(query: AvailabilityQuery) {
  const sku = await inventoryRepository.findSkuWithProductStatus(query.skuId);
  if (!sku) {
    throw new NotFoundError(
      Message.INVENTORY.SKU_NOT_FOUND.message,
      Message.INVENTORY.SKU_NOT_FOUND.code
    );
  }

  // SKU hoặc sản phẩm đã ngừng kinh doanh: vẫn trả 200 (SKU có thật) nhưng không chào bán ở đâu cả
  if (sku.status !== "ACTIVE" || sku.product.status !== "ACTIVE") {
    return { skuId: sku.id, skuCode: sku.skuCode, warehouses: [] };
  }

  const rows = await inventoryRepository.findAvailabilityBySkuId(query.skuId);

  const warehouses = rows
    .map((row) => ({
      warehouseId: row.warehouseId,
      name: row.warehouse.name,
      address: row.warehouse.address,
      available: row.quantityOnHand - row.quantityReserved,
    }))
    .filter((warehouse) => warehouse.available > 0)
    .sort((a, b) => b.available - a.available);

  return { skuId: sku.id, skuCode: sku.skuCode, warehouses };
}
