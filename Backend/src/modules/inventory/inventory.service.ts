import type { UserRole } from "@prisma/client";
import { ConflictError, ForbiddenError, NotFoundError } from "../../errors/appError.js";
import { Message } from "../../constants/message.js";
import { withAvailable } from "../../utils/inventory.util.js";
import * as inventoryRepository from "./inventory.repository.js";
import type { CreateInventoryInput } from "./inventory.schema.js";

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
