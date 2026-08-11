import type { Prisma } from "@prisma/client";
import { ConflictError, NotFoundError } from "../../errors/appError.js";
import * as warehouseRepository from "./warehouse.repository.js";
import type { CreateWarehouseInput, ListWarehousesQuery } from "./warehouse.schema.js";

// Tạo kho mới — check trùng code
export async function createWarehouse(input: CreateWarehouseInput) {
  const existing = await warehouseRepository.findByCode(input.code);
  if (existing) {
    throw new ConflictError("Mã kho đã tồn tại", "WAREHOUSE_CODE_ALREADY_EXISTS");
  }

  return warehouseRepository.createWarehouse(input);
}

// Danh sách kho có phân trang — public, ai cũng xem được
export async function listWarehouses(query: ListWarehousesQuery) {
  const where: Prisma.WarehouseWhereInput = {};
  if (query.status) {
    where.status = query.status;
  }

  const skip = (query.page - 1) * query.limit;

  const [items, total] = await Promise.all([
    warehouseRepository.findMany(where, skip, query.limit),
    warehouseRepository.count(where),
  ]);

  return { items, total };
}

// Xem chi tiết 1 kho — public
export async function getWarehouseById(id: string) {
  const warehouse = await warehouseRepository.findById(id);
  if (!warehouse) {
    throw new NotFoundError("Không tìm thấy kho", "WAREHOUSE_NOT_FOUND");
  }
  return warehouse;
}
