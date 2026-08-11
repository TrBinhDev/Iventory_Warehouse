import { prisma } from "../../config/prisma.js";

// Tìm kho theo code — dùng để check trùng lúc tạo
export function findByCode(code: string) {
  return prisma.warehouse.findUnique({ where: { code } });
}

// Tạo kho mới
export function createWarehouse(data: {
  code: string;
  name: string;
  address?: string;
  phone?: string;
}) {
  return prisma.warehouse.create({ data });
}
