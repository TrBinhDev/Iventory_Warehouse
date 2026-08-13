import type { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma.js";

// Tìm NCC theo code — dùng để check trùng lúc tạo
export function findByCode(code: string) {
  return prisma.supplier.findUnique({ where: { code } });
}

// Tìm NCC theo id
export function findById(id: string) {
  return prisma.supplier.findUnique({ where: { id } });
}

// Sửa NCC (partial update)
export function updateSupplier(id: string, data: Prisma.SupplierUpdateInput) {
  return prisma.supplier.update({ where: { id }, data });
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

// Đếm số phiếu nhập/xuất còn tham chiếu tới NCC này — dùng để chặn xoá.
// Chạy song song vì 2 truy vấn độc lập nhau.
export async function countReferences(supplierId: string) {
  const [inbound, outbound] = await Promise.all([
    prisma.inbound.count({ where: { supplierId } }),
    prisma.outbound.count({ where: { supplierId } }),
  ]);
  return { inbound, outbound };
}

// Xoá hẳn nhà cung cấp — chỉ gọi khi đã chắc không còn phiếu nào tham chiếu
export function deleteSupplier(id: string) {
  return prisma.supplier.delete({ where: { id } });
}
