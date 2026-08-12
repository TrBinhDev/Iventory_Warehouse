import type { Prisma } from "@prisma/client";
import { ConflictError, NotFoundError } from "../../errors/appError.js";
import { Message } from "../../constants/message.js";
import * as warehouseRepository from "./warehouse.repository.js";
import type {
  CreateWarehouseInput,
  ListWarehousesQuery,
  UpdateWarehouseInput,
} from "./warehouse.schema.js";

// Tạo kho mới — check trùng code
export async function createWarehouse(input: CreateWarehouseInput) {
  const existing = await warehouseRepository.findByCode(input.code);
  if (existing) {
    throw new ConflictError(Message.WAREHOUSE.CODE_ALREADY_EXISTS.message, Message.WAREHOUSE.CODE_ALREADY_EXISTS.code);
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
    throw new NotFoundError(Message.WAREHOUSE.NOT_FOUND.message, Message.WAREHOUSE.NOT_FOUND.code);
  }
  return warehouse;
}

// Sửa kho — Admin only, đổi code thì check trùng (FK thật dùng id nên đổi code không phá liên kết dữ liệu)
export async function updateWarehouse(id: string, input: UpdateWarehouseInput) {
  const existing = await warehouseRepository.findById(id);
  if (!existing) {
    throw new NotFoundError(Message.WAREHOUSE.NOT_FOUND.message, Message.WAREHOUSE.NOT_FOUND.code);
  }

  if (input.code !== undefined && input.code !== existing.code) {
    const duplicated = await warehouseRepository.findByCode(input.code);
    if (duplicated && duplicated.id !== id) {
      throw new ConflictError(Message.WAREHOUSE.CODE_ALREADY_EXISTS.message, Message.WAREHOUSE.CODE_ALREADY_EXISTS.code);
    }
  }

  return warehouseRepository.updateWarehouse(id, input);
}
