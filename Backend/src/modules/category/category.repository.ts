import { prisma } from "../../config/prisma.js";

// Tìm category theo code — dùng để check trùng lúc tạo
export function findByCode(code: string) {
  return prisma.category.findUnique({ where: { code } });
}

// Tạo loại sản phẩm mới
export function createCategory(data: { code: string; name: string }) {
  return prisma.category.create({ data });
}
