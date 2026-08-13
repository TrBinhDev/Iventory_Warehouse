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

// Sửa category (partial update)
export function updateCategory(id: string, data: Prisma.CategoryUpdateInput) {
  return prisma.category.update({ where: { id }, data });
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

// Đếm số sản phẩm đang gán loại này — dùng để chặn xoá.
// Lưu ý: ProductCategory có onDelete Cascade nên nếu không tự chặn thì Prisma sẽ âm thầm
// gỡ loại khỏi mọi sản phẩm mà không báo gì.
export function countProductLinks(categoryId: string) {
  return prisma.productCategory.count({ where: { categoryId } });
}

// Xoá hẳn loại sản phẩm — chỉ gọi khi đã chắc không còn sản phẩm nào gán
export function deleteCategory(id: string) {
  return prisma.category.delete({ where: { id } });
}
