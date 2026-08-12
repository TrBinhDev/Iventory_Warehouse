import { z } from "zod";

// Payload tạo nhà cung cấp mới
export const createSupplierSchema = z.object({
  code: z.string().min(1, "Mã NCC không được để trống").max(50, "Mã NCC tối đa 50 ký tự"),
  name: z.string().min(1, "Tên NCC không được để trống").max(255),
  contactName: z.string().max(255).optional(),
  phone: z.string().max(20).optional(),
  email: z.string().email("Email không hợp lệ").optional(),
  address: z.string().optional(),
  taxCode: z.string().max(50).optional(),
});

export type CreateSupplierInput = z.infer<typeof createSupplierSchema>;
