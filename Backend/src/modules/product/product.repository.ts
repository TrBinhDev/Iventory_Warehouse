import type { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma.js";

// Tìm product theo code — dùng để check trùng lúc tạo
export function findByCode(code: string) {
  return prisma.product.findUnique({ where: { code } });
}

// Đếm số category thực sự tồn tại trong danh sách id truyền vào — dùng validate categoryIds hợp lệ
export function countExistingCategories(categoryIds: string[]) {
  return prisma.category.count({ where: { id: { in: categoryIds } } });
}

// Tìm product theo id, không kèm relation — dùng để check tồn tại + lấy code hiện tại lúc sửa
export function findByIdBasic(id: string) {
  return prisma.product.findUnique({ where: { id } });
}

// Tìm product theo id, kèm categories (qua bảng trung gian) và skus
export function findById(id: string) {
  return prisma.product.findUnique({
    where: { id },
    include: {
      categories: { include: { category: true } },
      skus: true,
    },
  });
}

// Lấy danh sách sản phẩm theo filter, có phân trang
export function findMany(where: Prisma.ProductWhereInput, skip: number, take: number) {
  return prisma.product.findMany({
    where,
    skip,
    take,
    orderBy: { createdAt: "desc" },
  });
}

// Đếm tổng số sản phẩm khớp filter — dùng cho meta phân trang
export function count(where: Prisma.ProductWhereInput) {
  return prisma.product.count({ where });
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

// Lấy danh sách SKU thuộc 1 product
export function findSkusByProductId(productId: string) {
  return prisma.sKU.findMany({
    where: { productId },
    orderBy: { createdAt: "asc" },
  });
}

// Tìm SKU theo skuCode — dùng để check trùng lúc tạo
export function findSkuByCode(skuCode: string) {
  return prisma.sKU.findUnique({ where: { skuCode } });
}

// Tìm SKU theo barcode — dùng để check trùng lúc tạo (chỉ gọi khi có barcode)
export function findSkuByBarcode(barcode: string) {
  return prisma.sKU.findUnique({ where: { barcode } });
}

// Tạo SKU (biến thể) mới cho 1 sản phẩm
export function createSku(data: {
  productId: string;
  skuCode: string;
  barcode?: string;
  attributes?: Prisma.InputJsonValue;
  price: string;
  cost?: string;
  weight?: string;
}) {
  return prisma.sKU.create({ data });
}

// Sửa sản phẩm (partial update) — categoryIds nếu !== undefined thì xoá hết category cũ, gán lại theo danh sách mới
// (deleteMany + create trong cùng 1 lệnh update, vẫn atomic nhờ nested write của Prisma)
export function updateProduct(
  id: string,
  data: {
    code?: string;
    name?: string;
    description?: string;
    unit?: string;
    images?: string[];
    status?: "ACTIVE" | "INACTIVE";
    categoryIds?: string[];
  }
) {
  return prisma.product.update({
    where: { id },
    data: {
      code: data.code,
      name: data.name,
      description: data.description,
      unit: data.unit,
      images: data.images,
      status: data.status,
      ...(data.categoryIds !== undefined
        ? {
            // Ép updatedAt tự tay — nếu chỉ đổi categoryIds thì data không có field nào của riêng Product,
            // Prisma sẽ bỏ qua UPDATE trên bảng Product (chỉ đụng ProductCategory), updatedAt sẽ không tự nhảy nếu thiếu dòng này
            updatedAt: new Date(),
            categories: {
              deleteMany: {},
              create: data.categoryIds.map((categoryId) => ({ categoryId })),
            },
          }
        : {}),
    },
    include: {
      categories: { include: { category: true } },
    },
  });
}
