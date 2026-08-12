import { prisma } from "../../config/prisma.js";

// Tìm NCC theo code — dùng để check trùng lúc tạo
export function findByCode(code: string) {
  return prisma.supplier.findUnique({ where: { code } });
}

// Tạo nhà cung cấp mới
export function createSupplier(data: {
  code: string;
  name: string;
  contactName?: string;
  phone?: string;
  email?: string;
  address?: string;
  taxCode?: string;
}) {
  return prisma.supplier.create({ data });
}
