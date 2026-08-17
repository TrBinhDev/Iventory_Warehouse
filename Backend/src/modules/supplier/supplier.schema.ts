import { z } from "zod";
import { phoneSchema } from "../../utils/phone.util.js";

// Payload tạo nhà cung cấp mới
export const createSupplierSchema = z.object({
  code: z.string().min(1, "Mã NCC không được để trống").max(50, "Mã NCC tối đa 50 ký tự"),
  name: z.string().min(1, "Tên NCC không được để trống").max(255),
  contactName: z.string().max(255).optional(),
  phone: phoneSchema.optional(),
  email: z.string().email("Email không hợp lệ").optional(),
  address: z.string().optional(),
  taxCode: z.string().max(50).optional(),
});

export type CreateSupplierInput = z.infer<typeof createSupplierSchema>;

// Query params cho danh sách NCC (phân trang + filter status + tìm kiếm)
export const listSuppliersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
  // MỘT ô tìm cho 5 cột: name, code, phone, contactName, email — người dùng gõ gì cũng ra,
  // không phải chọn trước đang tra bằng gì
  search: z.string().trim().min(1).max(255).optional(),
});

export type ListSuppliersQuery = z.infer<typeof listSuppliersQuerySchema>;

// Param :id dùng chung cho GET/PATCH /suppliers/:id
export const supplierIdParamSchema = z.object({
  id: z.string().uuid("id không hợp lệ"),
});

export type SupplierIdParam = z.infer<typeof supplierIdParamSchema>;

// Payload sửa NCC (partial update) — code sửa được (chỉ FK dùng id), check trùng khi đổi
export const updateSupplierSchema = z.object({
  code: z.string().min(1, "Mã NCC không được để trống").max(50, "Mã NCC tối đa 50 ký tự").optional(),
  name: z.string().min(1, "Tên NCC không được để trống").max(255).optional(),
  contactName: z.string().max(255).optional(),
  phone: phoneSchema.optional(),
  email: z.string().email("Email không hợp lệ").optional(),
  address: z.string().optional(),
  taxCode: z.string().max(50).optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
});

export type UpdateSupplierInput = z.infer<typeof updateSupplierSchema>;
