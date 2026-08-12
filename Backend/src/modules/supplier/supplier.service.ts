import { ConflictError } from "../../errors/appError.js";
import * as supplierRepository from "./supplier.repository.js";
import type { CreateSupplierInput } from "./supplier.schema.js";

// Tạo nhà cung cấp mới — check trùng code
export async function createSupplier(input: CreateSupplierInput) {
  const existing = await supplierRepository.findByCode(input.code);
  if (existing) {
    throw new ConflictError("Mã nhà cung cấp đã tồn tại", "SUPPLIER_CODE_ALREADY_EXISTS");
  }

  return supplierRepository.createSupplier(input);
}
