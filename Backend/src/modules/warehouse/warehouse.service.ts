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

// Xoá hẳn kho — Admin only, chỉ cho xoá khi chưa có gì tham chiếu tới.
// Kho là đầu mối của gần như mọi nghiệp vụ nên phải soát 8 bảng; ca nguy hiểm nhất là kho
// mới lập chỉ mới gán nhân viên — trước đây FK User.warehouseId là SET NULL nên DB cho xoá
// và biến Manager/Staff thành tài khoản không thuộc kho nào.
export async function deleteWarehouse(id: string) {
  const existing = await warehouseRepository.findById(id);
  if (!existing) {
    throw new NotFoundError(Message.WAREHOUSE.NOT_FOUND.message, Message.WAREHOUSE.NOT_FOUND.code);
  }

  const counts = await warehouseRepository.countReferences(id);
  const blockers = [
    { resource: "user", label: "tài khoản", count: counts.user },
    { resource: "inventory", label: "dòng tồn kho", count: counts.inventory },
    { resource: "reservation", label: "phiếu giữ chỗ", count: counts.reservation },
    { resource: "salesOrder", label: "đơn hàng", count: counts.salesOrder },
    { resource: "inbound", label: "phiếu nhập", count: counts.inbound },
    { resource: "outbound", label: "phiếu xuất", count: counts.outbound },
    { resource: "transfer", label: "phiếu chuyển kho", count: counts.transfer },
    { resource: "inventoryAdjustment", label: "phiếu điều chỉnh", count: counts.adjustment },
  ].filter((item) => item.count > 0);

  if (blockers.length > 0) {
    throw new ConflictError(
      Message.WAREHOUSE.IN_USE.message,
      Message.WAREHOUSE.IN_USE.code,
      blockers
    );
  }

  await warehouseRepository.deleteWarehouse(id);
}
