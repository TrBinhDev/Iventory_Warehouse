import { z } from "zod";

// Payload tạo tài khoản Admin/Manager/Staff (Customer tự đăng ký qua /auth/register)
export const createUserSchema = z
  .object({
    fullName: z.string().min(1, "Họ tên không được để trống").max(255),
    email: z.string().email("Email không hợp lệ"),
    password: z.string().min(8, "Mật khẩu tối thiểu 8 ký tự"),
    phone: z.string().max(20).optional(),
    role: z.enum(["ADMIN", "WAREHOUSE_MANAGER", "WAREHOUSE_STAFF"]),
    warehouseId: z.string().uuid("warehouseId không hợp lệ").optional(),
  })
  .refine(
    (data) =>
      data.role === "ADMIN"
        ? data.warehouseId === undefined
        : data.warehouseId !== undefined,
    {
      message: "warehouseId bắt buộc với Manager/Staff, không được có với Admin",
      path: ["warehouseId"],
    }
  );

export type CreateUserInput = z.infer<typeof createUserSchema>;

// Query params cho danh sách tài khoản (phân trang + filter)
export const listUsersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  role: z.enum(["ADMIN", "WAREHOUSE_MANAGER", "WAREHOUSE_STAFF", "CUSTOMER"]).optional(),
  status: z.enum(["ACTIVE", "INACTIVE", "BLOCKED"]).optional(),
});

export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;

// Param :id dùng chung cho GET/PATCH /users/:id
export const userIdParamSchema = z.object({
  id: z.string().uuid("id không hợp lệ"),
});

export type UserIdParam = z.infer<typeof userIdParamSchema>;

// Payload sửa tài khoản (partial update) — role/warehouseId chỉ Admin được gửi (check ở service layer)
export const updateUserSchema = z.object({
  fullName: z.string().min(1, "Họ tên không được để trống").max(255).optional(),
  phone: z.string().max(20).optional(),
  avatarUrl: z.string().url("avatarUrl không hợp lệ").optional(),
  email: z.string().email("Email không hợp lệ").optional(),
  status: z.enum(["ACTIVE", "INACTIVE", "BLOCKED"]).optional(),
  role: z.enum(["ADMIN", "WAREHOUSE_MANAGER", "WAREHOUSE_STAFF"]).optional(),
  warehouseId: z.string().uuid("warehouseId không hợp lệ").nullable().optional(),
});

export type UpdateUserInput = z.infer<typeof updateUserSchema>;
