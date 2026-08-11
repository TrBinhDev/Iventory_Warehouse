import { z } from "zod";

// Payload tạo kho mới
export const createWarehouseSchema = z.object({
  code: z.string().min(1, "Mã kho không được để trống").max(50, "Mã kho tối đa 50 ký tự"),
  name: z.string().min(1, "Tên kho không được để trống").max(255),
  address: z.string().optional(),
  phone: z.string().max(20).optional(),
});

export type CreateWarehouseInput = z.infer<typeof createWarehouseSchema>;

// Query params cho danh sách kho (phân trang + filter status)
export const listWarehousesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
});

export type ListWarehousesQuery = z.infer<typeof listWarehousesQuerySchema>;
