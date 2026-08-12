import type { Prisma } from "@prisma/client";
import { BadRequestError, ConflictError } from "../../errors/appError.js";
import { Message } from "../../constants/message.js";
import * as productRepository from "./product.repository.js";
import type { CreateProductInput } from "./product.schema.js";

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
