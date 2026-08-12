import type { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma.js";

// Tìm NCC theo code — dùng để check trùng lúc tạo
export function findByCode(code: string) {
  return prisma.supplier.findUnique({ where: { code } });
}

// Lấy danh sách NCC theo filter, có phân trang
export function findMany(where: Prisma.SupplierWhereInput, skip: number, take: number) {
  return prisma.supplier.findMany({
    where,
    skip,
    take,
    orderBy: { createdAt: "desc" },
  });
}

// Đếm tổng số NCC khớp filter — dùng cho meta phân trang
export function count(where: Prisma.SupplierWhereInput) {
  return prisma.supplier.count({ where });
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
