import type { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma.js";

// Tìm category theo code — dùng để check trùng lúc tạo
export function findByCode(code: string) {
  return prisma.category.findUnique({ where: { code } });
}

// Tìm category theo id
export function findById(id: string) {
  return prisma.category.findUnique({ where: { id } });
}

// Lấy danh sách category theo filter, có phân trang
export function findMany(where: Prisma.CategoryWhereInput, skip: number, take: number) {
  return prisma.category.findMany({
    where,
    skip,
    take,
    orderBy: { createdAt: "desc" },
  });
}

// Đếm tổng số category khớp filter — dùng cho meta phân trang
export function count(where: Prisma.CategoryWhereInput) {
  return prisma.category.count({ where });
}

// Tạo loại sản phẩm mới
export function createCategory(data: { code: string; name: string }) {
  return prisma.category.create({ data });
}
