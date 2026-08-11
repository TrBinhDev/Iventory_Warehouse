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
