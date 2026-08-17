import type { Prisma } from "@prisma/client";
import { ConflictError, NotFoundError } from "../../errors/appError.js";
import { Message } from "../../constants/message.js";
import { assertNoReferences } from "../../utils/reference.util.js";
import * as categoryRepository from "./category.repository.js";
import type {
  CreateCategoryInput,
  ListCategoriesQuery,
  UpdateCategoryInput,
} from "./category.schema.js";

// Tạo loại sản phẩm mới — check trùng code
export async function createCategory(input: CreateCategoryInput) {
  const existing = await categoryRepository.findByCode(input.code);
  if (existing) {
    throw new ConflictError(
      Message.CATEGORY.CODE_ALREADY_EXISTS.message,
      Message.CATEGORY.CODE_ALREADY_EXISTS.code
    );
  }

  return categoryRepository.createCategory(input);
}

// Danh sách category có phân trang — public, ai cũng xem được
export async function listCategories(query: ListCategoriesQuery) {
  const where: Prisma.CategoryWhereInput = {};
  if (query.status) {
    where.status = query.status;
  }

  if (query.search) {
    where.OR = [
      { name: { contains: query.search, mode: "insensitive" } },
      { code: { contains: query.search, mode: "insensitive" } },
    ];
  }

  const skip = (query.page - 1) * query.limit;

  const [items, total] = await Promise.all([
    categoryRepository.findMany(where, skip, query.limit),
    categoryRepository.count(where),
  ]);

  return { items, total };
}

// Xem chi tiết 1 category — public
export async function getCategoryById(id: string) {
  const category = await categoryRepository.findById(id);
  if (!category) {
    throw new NotFoundError(Message.CATEGORY.NOT_FOUND.message, Message.CATEGORY.NOT_FOUND.code);
  }
  return category;
}

// Sửa category — Admin only, đổi code thì check trùng (FK thật dùng id nên đổi code không phá liên kết dữ liệu)
export async function updateCategory(id: string, input: UpdateCategoryInput) {
  const existing = await categoryRepository.findById(id);
  if (!existing) {
    throw new NotFoundError(Message.CATEGORY.NOT_FOUND.message, Message.CATEGORY.NOT_FOUND.code);
  }

  if (input.code !== undefined && input.code !== existing.code) {
    const duplicated = await categoryRepository.findByCode(input.code);
    if (duplicated && duplicated.id !== id) {
      throw new ConflictError(
        Message.CATEGORY.CODE_ALREADY_EXISTS.message,
        Message.CATEGORY.CODE_ALREADY_EXISTS.code
      );
    }
  }

  return categoryRepository.updateCategory(id, input);
}

// Xoá hẳn loại sản phẩm — Admin only, chỉ cho xoá khi chưa gán cho sản phẩm nào.
// Đếm trước rồi mới xoá (thay vì xoá rồi bắt lỗi) để báo được vướng ở đâu, bao nhiêu.
// Riêng category còn một lý do nữa: ProductCategory để onDelete Cascade nên nếu không tự chặn
// thì Prisma xoá luôn mà không báo, sản phẩm mất phân loại mà không ai biết.
export async function deleteCategory(id: string) {
  const existing = await categoryRepository.findById(id);
  if (!existing) {
    throw new NotFoundError(Message.CATEGORY.NOT_FOUND.message, Message.CATEGORY.NOT_FOUND.code);
  }

  const productCount = await categoryRepository.countProductLinks(id);
  assertNoReferences(
    [{ resource: "product", label: "sản phẩm", count: productCount }],
    Message.CATEGORY.IN_USE
  );

  await categoryRepository.deleteCategory(id);
}
