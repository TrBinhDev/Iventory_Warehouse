import type { Prisma } from "@prisma/client";
import { BadRequestError, ConflictError, NotFoundError } from "../../errors/appError.js";
import { Message } from "../../constants/message.js";
import { deleteFilesByUrls, findRemovedUrls } from "../../utils/storage.util.js";
import * as productRepository from "./product.repository.js";
import type {
  CreateProductInput,
  ListProductsQuery,
  UpdateProductInput,
  CreateSkuInput,
  UpdateSkuInput,
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

  // Ảnh bị gỡ khỏi mảng thì xoá luôn file trên R2, tránh tích rác.
  // Gọi SAU khi DB đã cập nhật xong — xoá hụt chỉ để lại file thừa, còn xoá trước mà DB fail
  // thì ảnh mất trong khi bản ghi vẫn trỏ tới. Chỉ chạy khi client thực sự gửi field images.
  if (input.images !== undefined) {
    const removed = findRemovedUrls(existingProduct.images, input.images);
    if (removed.length > 0) {
      await deleteFilesByUrls(removed);
    }
  }

  return toProductResponse(product);
}

// Lấy danh sách SKU của 1 sản phẩm — check product tồn tại trước
export async function getSkusByProduct(productId: string) {
  const product = await productRepository.findByIdBasic(productId);
  if (!product) {
    throw new NotFoundError(Message.PRODUCT.NOT_FOUND.message, Message.PRODUCT.NOT_FOUND.code);
  }

  return productRepository.findSkusByProductId(productId);
}

// Xem chi tiết 1 SKU — check SKU tồn tại và đúng thuộc productId truyền vào
export async function getSkuDetail(productId: string, skuId: string) {
  const sku = await productRepository.findSkuById(skuId);
  if (!sku || sku.productId !== productId) {
    throw new NotFoundError(Message.PRODUCT.SKU_NOT_FOUND.message, Message.PRODUCT.SKU_NOT_FOUND.code);
  }
  return sku;
}

// Xoá hẳn sản phẩm — Admin only, chỉ cho xoá khi chưa có SKU nào.
// Xoá xong thì dọn luôn ảnh trên R2 (best-effort, sau khi DB đã xong — cùng nguyên tắc với A5).
// Các dòng ProductCategory gắn với sản phẩm sẽ tự mất theo nhờ onDelete Cascade, đó là mong muốn.
export async function deleteProduct(id: string) {
  const existing = await productRepository.findByIdBasic(id);
  if (!existing) {
    throw new NotFoundError(Message.PRODUCT.NOT_FOUND.message, Message.PRODUCT.NOT_FOUND.code);
  }

  const skuCount = await productRepository.countSkus(id);
  const blockers = [{ resource: "sku", label: "SKU", count: skuCount }].filter(
    (item) => item.count > 0
  );

  if (blockers.length > 0) {
    throw new ConflictError(Message.PRODUCT.IN_USE.message, Message.PRODUCT.IN_USE.code, blockers);
  }

  await productRepository.deleteProduct(id);

  if (existing.images.length > 0) {
    await deleteFilesByUrls(existing.images);
  }
}

// Tạo SKU mới cho 1 sản phẩm — check product tồn tại, check trùng skuCode/barcode
export async function createSku(productId: string, input: CreateSkuInput) {
  const product = await productRepository.findByIdBasic(productId);
  if (!product) {
    throw new NotFoundError(Message.PRODUCT.NOT_FOUND.message, Message.PRODUCT.NOT_FOUND.code);
  }

  const existingCode = await productRepository.findSkuByCode(input.skuCode);
  if (existingCode) {
    throw new ConflictError(
      Message.PRODUCT.SKU_CODE_ALREADY_EXISTS.message,
      Message.PRODUCT.SKU_CODE_ALREADY_EXISTS.code
    );
  }

  if (input.barcode) {
    const existingBarcode = await productRepository.findSkuByBarcode(input.barcode);
    if (existingBarcode) {
      throw new ConflictError(
        Message.PRODUCT.SKU_BARCODE_ALREADY_EXISTS.message,
        Message.PRODUCT.SKU_BARCODE_ALREADY_EXISTS.code
      );
    }
  }

  return productRepository.createSku({
    productId,
    skuCode: input.skuCode,
    barcode: input.barcode,
    // attributes đã được Zod validate là plain object (record) — ép kiểu sang InputJsonValue cho Prisma
    attributes: input.attributes as Prisma.InputJsonValue | undefined,
    price: input.price,
    cost: input.cost,
    weight: input.weight,
  });
}

// Sửa SKU (partial update) — check SKU tồn tại + đúng thuộc productId, check trùng skuCode/barcode nếu đổi
export async function updateSku(productId: string, skuId: string, input: UpdateSkuInput) {
  const existingSku = await productRepository.findSkuById(skuId);
  if (!existingSku || existingSku.productId !== productId) {
    throw new NotFoundError(Message.PRODUCT.SKU_NOT_FOUND.message, Message.PRODUCT.SKU_NOT_FOUND.code);
  }

  if (input.skuCode !== undefined && input.skuCode !== existingSku.skuCode) {
    const duplicatedCode = await productRepository.findSkuByCode(input.skuCode);
    if (duplicatedCode && duplicatedCode.id !== skuId) {
      throw new ConflictError(
        Message.PRODUCT.SKU_CODE_ALREADY_EXISTS.message,
        Message.PRODUCT.SKU_CODE_ALREADY_EXISTS.code
      );
    }
  }

  if (input.barcode !== undefined && input.barcode !== existingSku.barcode) {
    const duplicatedBarcode = await productRepository.findSkuByBarcode(input.barcode);
    if (duplicatedBarcode && duplicatedBarcode.id !== skuId) {
      throw new ConflictError(
        Message.PRODUCT.SKU_BARCODE_ALREADY_EXISTS.message,
        Message.PRODUCT.SKU_BARCODE_ALREADY_EXISTS.code
      );
    }
  }

  return productRepository.updateSku(skuId, {
    skuCode: input.skuCode,
    barcode: input.barcode,
    attributes: input.attributes as Prisma.InputJsonValue | undefined,
    price: input.price,
    cost: input.cost,
    weight: input.weight,
    status: input.status,
  });
}
