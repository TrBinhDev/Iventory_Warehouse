import { prisma } from "../../config/prisma.js";

// Tìm product theo code — dùng để check trùng lúc tạo
export function findByCode(code: string) {
  return prisma.product.findUnique({ where: { code } });
}

// Đếm số category thực sự tồn tại trong danh sách id truyền vào — dùng validate categoryIds hợp lệ
export function countExistingCategories(categoryIds: string[]) {
  return prisma.category.count({ where: { id: { in: categoryIds } } });
}

// Tạo sản phẩm mới, kèm gán category qua bảng trung gian ProductCategory (nested create, cùng 1 transaction ngầm của Prisma)
export function createProduct(data: {
  code: string;
  name: string;
  description?: string;
  unit: string;
  images: string[];
  categoryIds: string[];
}) {
  return prisma.product.create({
    data: {
      code: data.code,
      name: data.name,
      description: data.description,
      unit: data.unit,
      images: data.images,
      categories: {
        create: data.categoryIds.map((categoryId) => ({ categoryId })),
      },
    },
    include: {
      categories: { include: { category: true } },
    },
  });
}
