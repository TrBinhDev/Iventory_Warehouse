import type { Prisma } from "@prisma/client";
import { ConflictError } from "../../errors/appError.js";
import { Message } from "../../constants/message.js";
import * as categoryRepository from "./category.repository.js";
import type { CreateCategoryInput, ListCategoriesQuery } from "./category.schema.js";

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

  const skip = (query.page - 1) * query.limit;

  const [items, total] = await Promise.all([
    categoryRepository.findMany(where, skip, query.limit),
    categoryRepository.count(where),
  ]);

  return { items, total };
}
