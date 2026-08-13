import { ConflictError, NotFoundError } from "../../errors/appError.js";
import { Message } from "../../constants/message.js";
import * as inventoryRepository from "./inventory.repository.js";
import type { CreateInventoryInput } from "./inventory.schema.js";

// Bổ sung quantityAvailable vào response — không lưu cột riêng trong DB,
// luôn tính runtime = onHand - reserved để tránh có thêm 1 nguồn số liệu có thể lệch
export function withAvailable<T extends { quantityOnHand: number; quantityReserved: number }>(
  inventory: T
) {
  return {
    ...inventory,
    quantityAvailable: inventory.quantityOnHand - inventory.quantityReserved,
  };
}

// Khởi tạo dòng tồn kho cho 1 cặp kho + SKU — Admin khai báo trước khi nhập hàng lần đầu
export async function createInventory(input: CreateInventoryInput) {
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
