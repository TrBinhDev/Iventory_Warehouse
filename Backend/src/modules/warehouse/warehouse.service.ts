import { ConflictError } from "../../errors/appError.js";
import * as warehouseRepository from "./warehouse.repository.js";
import type { CreateWarehouseInput } from "./warehouse.schema.js";

// Tạo kho mới — check trùng code
export async function createWarehouse(input: CreateWarehouseInput) {
  const existing = await warehouseRepository.findByCode(input.code);
  if (existing) {
    throw new ConflictError("Mã kho đã tồn tại", "WAREHOUSE_CODE_ALREADY_EXISTS");
  }

  return warehouseRepository.createWarehouse(input);
}
