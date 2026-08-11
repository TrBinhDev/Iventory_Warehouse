import { z } from "zod";

// Payload tạo kho mới
export const createWarehouseSchema = z.object({
  code: z.string().min(1, "Mã kho không được để trống").max(50, "Mã kho tối đa 50 ký tự"),
  name: z.string().min(1, "Tên kho không được để trống").max(255),
  address: z.string().optional(),
  phone: z.string().max(20).optional(),
});

export type CreateWarehouseInput = z.infer<typeof createWarehouseSchema>;
