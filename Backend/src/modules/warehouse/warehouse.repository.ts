import type { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma.js";

// Tìm kho theo code — dùng để check trùng lúc tạo
export function findByCode(code: string) {
  return prisma.warehouse.findUnique({ where: { code } });
}

// Lấy danh sách kho theo filter, có phân trang
export function findMany(where: Prisma.WarehouseWhereInput, skip: number, take: number) {
  return prisma.warehouse.findMany({
    where,
    skip,
    take,
    orderBy: { createdAt: "desc" },
  });
}

// Đếm tổng số kho khớp filter — dùng cho meta phân trang
export function count(where: Prisma.WarehouseWhereInput) {
  return prisma.warehouse.count({ where });
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
