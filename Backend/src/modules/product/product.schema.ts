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
