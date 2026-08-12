import type { Prisma } from "@prisma/client";
import { BadRequestError, ConflictError, NotFoundError } from "../../errors/appError.js";
import { Message } from "../../constants/message.js";
import * as productRepository from "./product.repository.js";
import type {
  CreateProductInput,
  ListProductsQuery,
  UpdateProductInput,
} from "./product.schema.js";

type ProductWithCategories = Prisma.ProductGetPayload<{
  include: { categories: { include: { category: true } } };
}>;

type ProductWithDetails = Prisma.ProductGetPayload<{
  include: { categories: { include: { category: true } }; skus: true };
}>;

// Chuẩn hoá response: category lồng phẳng ra thành mảng Category thật, bỏ field trung gian của bảng nối
function toProductResponse(product: ProductWithCategories) {
  const { categories, ...rest } = product;
  return {
    ...rest,
    categories: categories.map((productCategory) => productCategory.category),
  };
}

// Giống toProductResponse nhưng giữ thêm skus (đã include sẵn, không cần flatten vì SKU trỏ thẳng productId, không qua bảng trung gian)
function toProductDetailResponse(product: ProductWithDetails) {
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

// Xem chi tiết 1 sản phẩm — public, kèm categories + skus
export async function getProductById(id: string) {
  const product = await productRepository.findById(id);
  if (!product) {
    throw new NotFoundError(Message.PRODUCT.NOT_FOUND.message, Message.PRODUCT.NOT_FOUND.code);
  }
  return toProductDetailResponse(product);
}

// Sửa sản phẩm — Admin only, đổi code check trùng, categoryIds nếu gửi thì validate tồn tại rồi set lại toàn bộ
export async function updateProduct(id: string, input: UpdateProductInput) {
  const existingProduct = await productRepository.findByIdBasic(id);
  if (!existingProduct) {
    throw new NotFoundError(Message.PRODUCT.NOT_FOUND.message, Message.PRODUCT.NOT_FOUND.code);
  }

  if (input.code !== undefined && input.code !== existingProduct.code) {
    const duplicated = await productRepository.findByCode(input.code);
    if (duplicated && duplicated.id !== id) {
      throw new ConflictError(
        Message.PRODUCT.CODE_ALREADY_EXISTS.message,
        Message.PRODUCT.CODE_ALREADY_EXISTS.code
      );
    }
  }

  let categoryIds: string[] | undefined;
  if (input.categoryIds !== undefined) {
    categoryIds = [...new Set(input.categoryIds)];
    if (categoryIds.length > 0) {
      const foundCount = await productRepository.countExistingCategories(categoryIds);
      if (foundCount !== categoryIds.length) {
        throw new BadRequestError(
          Message.PRODUCT.CATEGORY_NOT_FOUND.message,
          Message.PRODUCT.CATEGORY_NOT_FOUND.code
        );
      }
    }
  }

  const product = await productRepository.updateProduct(id, {
    code: input.code,
    name: input.name,
    description: input.description,
    unit: input.unit,
    images: input.images,
    status: input.status,
    categoryIds,
  });

  return toProductResponse(product);
}
