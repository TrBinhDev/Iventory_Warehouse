import type { Prisma } from "@prisma/client";
import { BadRequestError, ConflictError } from "../../errors/appError.js";
import { Message } from "../../constants/message.js";
import * as productRepository from "./product.repository.js";
import type { CreateProductInput, ListProductsQuery } from "./product.schema.js";

type ProductWithCategories = Prisma.ProductGetPayload<{
  include: { categories: { include: { category: true } } };
}>;

// Chuẩn hoá response: category lồng phẳng ra thành mảng Category thật, bỏ field trung gian của bảng nối
function toProductResponse(product: ProductWithCategories) {
  const { categories, ...rest } = product;
  return {
    ...rest,
    categories: categories.map((productCategory) => productCategory.category),
  };
}

// Tạo sản phẩm mới — check trùng code, validate categoryIds tồn tại trước khi gán
export async function createProduct(input: CreateProductInput) {
  const existingProduct = await productRepository.findByCode(input.code);
  if (existingProduct) {
    throw new ConflictError(
      Message.PRODUCT.CODE_ALREADY_EXISTS.message,
      Message.PRODUCT.CODE_ALREADY_EXISTS.code
    );
  }

  const categoryIds = [...new Set(input.categoryIds ?? [])];
  if (categoryIds.length > 0) {
    const foundCount = await productRepository.countExistingCategories(categoryIds);
    if (foundCount !== categoryIds.length) {
      throw new BadRequestError(
        Message.PRODUCT.CATEGORY_NOT_FOUND.message,
        Message.PRODUCT.CATEGORY_NOT_FOUND.code
      );
    }
  }

  const product = await productRepository.createProduct({
    code: input.code,
    name: input.name,
    description: input.description,
    unit: input.unit,
    images: input.images ?? [],
    categoryIds,
  });

  return toProductResponse(product);
}

// Danh sách sản phẩm có phân trang — public, filter status/category, search theo tên/mã
export async function listProducts(query: ListProductsQuery) {
  const where: Prisma.ProductWhereInput = {};

  if (query.status) {
    where.status = query.status;
  }

  if (query.categoryId) {
    where.categories = { some: { categoryId: query.categoryId } };
  }

  if (query.search) {
    where.OR = [
      { name: { contains: query.search, mode: "insensitive" } },
      { code: { contains: query.search, mode: "insensitive" } },
    ];
  }

  const skip = (query.page - 1) * query.limit;

  const [items, total] = await Promise.all([
    productRepository.findMany(where, skip, query.limit),
    productRepository.count(where),
  ]);

  return { items, total };
}
