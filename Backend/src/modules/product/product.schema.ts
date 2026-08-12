import { z } from "zod";

// Payload tạo sản phẩm mới, kèm gán category (optional)
export const createProductSchema = z.object({
  code: z.string().min(1, "Mã sản phẩm không được để trống").max(50, "Mã tối đa 50 ký tự"),
  name: z.string().min(1, "Tên sản phẩm không được để trống").max(255),
  description: z.string().optional(),
  unit: z.string().min(1, "Đơn vị tính không được để trống").max(20),
  images: z.array(z.string().url("URL ảnh không hợp lệ")).optional(),
  categoryIds: z.array(z.string().uuid("categoryId không hợp lệ")).optional(),
});

export type CreateProductInput = z.infer<typeof createProductSchema>;

// Query params cho danh sách sản phẩm (phân trang + filter status/category + search tên/mã)
export const listProductsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
  categoryId: z.string().uuid("categoryId không hợp lệ").optional(),
  search: z.string().min(1).max(255).optional(),
});

export type ListProductsQuery = z.infer<typeof listProductsQuerySchema>;

// Param :id dùng chung cho GET/PATCH /products/:id
export const productIdParamSchema = z.object({
  id: z.string().uuid("id không hợp lệ"),
});

export type ProductIdParam = z.infer<typeof productIdParamSchema>;
