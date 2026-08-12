import { z } from "zod";

// Payload tạo loại sản phẩm mới
export const createCategorySchema = z.object({
  code: z.string().min(1, "Mã không được để trống").max(50, "Mã tối đa 50 ký tự"),
  name: z.string().min(1, "Tên không được để trống").max(255),
});

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;

// Query params cho danh sách category (phân trang + filter status)
export const listCategoriesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
});

export type ListCategoriesQuery = z.infer<typeof listCategoriesQuerySchema>;

// Param :id dùng chung cho GET/PATCH /categories/:id
export const categoryIdParamSchema = z.object({
  id: z.string().uuid("id không hợp lệ"),
});

export type CategoryIdParam = z.infer<typeof categoryIdParamSchema>;
