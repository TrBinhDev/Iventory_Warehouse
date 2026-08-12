import { ConflictError } from "../../errors/appError.js";
import { Message } from "../../constants/message.js";
import * as categoryRepository from "./category.repository.js";
import type { CreateCategoryInput } from "./category.schema.js";

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
