import { z } from "zod";

// Payload tạo loại sản phẩm mới
export const createCategorySchema = z.object({
  code: z.string().min(1, "Mã không được để trống").max(50, "Mã tối đa 50 ký tự"),
  name: z.string().min(1, "Tên không được để trống").max(255),
});

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
