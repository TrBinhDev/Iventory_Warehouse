import type { Prisma } from "@prisma/client";
import { ConflictError, NotFoundError } from "../../errors/appError.js";
import * as supplierRepository from "./supplier.repository.js";
import type { CreateSupplierInput, ListSuppliersQuery } from "./supplier.schema.js";

// Tạo nhà cung cấp mới — check trùng code
export async function createSupplier(input: CreateSupplierInput) {
  const existing = await supplierRepository.findByCode(input.code);
  if (existing) {
    throw new ConflictError("Mã nhà cung cấp đã tồn tại", "SUPPLIER_CODE_ALREADY_EXISTS");
  }

  return supplierRepository.createSupplier(input);
}

// Danh sách NCC có phân trang — Admin/Manager/Staff đều xem được
export async function listSuppliers(query: ListSuppliersQuery) {
  const where: Prisma.SupplierWhereInput = {};
  if (query.status) {
    where.status = query.status;
  }

  const skip = (query.page - 1) * query.limit;

  const [items, total] = await Promise.all([
    supplierRepository.findMany(where, skip, query.limit),
    supplierRepository.count(where),
  ]);

  return { items, total };
}

// Xem chi tiết 1 NCC
export async function getSupplierById(id: string) {
  const supplier = await supplierRepository.findById(id);
  if (!supplier) {
    throw new NotFoundError("Không tìm thấy nhà cung cấp", "SUPPLIER_NOT_FOUND");
  }
  return supplier;
}
