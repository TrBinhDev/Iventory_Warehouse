import { z } from "zod";

// Payload đăng ký tài khoản Customer
export const registerSchema = z.object({
  email: z.string().email("Email không hợp lệ"),
  password: z.string().min(8, "Mật khẩu tối thiểu 8 ký tự"),
  fullName: z.string().min(1, "Họ tên không được để trống").max(255),
  phone: z.string().max(20).optional(),
});

export type RegisterInput = z.infer<typeof registerSchema>;
