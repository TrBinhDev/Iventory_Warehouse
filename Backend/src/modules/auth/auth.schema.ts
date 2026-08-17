import { z } from "zod";
import { EMAIL_VERIFY_OTP_LENGTH } from "../../constants/token.js";
import { phoneSchema } from "../../utils/phone.util.js";

// Payload đăng ký tài khoản Customer
export const registerSchema = z.object({
  email: z.string().email("Email không hợp lệ"),
  password: z.string().min(8, "Mật khẩu tối thiểu 8 ký tự"),
  fullName: z.string().min(1, "Họ tên không được để trống").max(255),
  phone: phoneSchema.optional(),
});

export type RegisterInput = z.infer<typeof registerSchema>;

// Payload đăng nhập — dùng chung cho mọi role
export const loginSchema = z.object({
  email: z.string().email("Email không hợp lệ"),
  password: z.string().min(1, "Mật khẩu không được để trống"),
});

export type LoginInput = z.infer<typeof loginSchema>;

// Payload verify email bằng mã OTP
export const verifyEmailSchema = z.object({
  email: z.string().email("Email không hợp lệ"),
  otp: z
    .string()
    .length(EMAIL_VERIFY_OTP_LENGTH, `Mã OTP phải có ${EMAIL_VERIFY_OTP_LENGTH} chữ số`)
    .regex(/^\d+$/, "Mã OTP chỉ gồm chữ số"),
});

export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;

// Payload gửi lại mã OTP xác thực email
export const resendVerificationSchema = z.object({
  email: z.string().email("Email không hợp lệ"),
});

export type ResendVerificationInput = z.infer<typeof resendVerificationSchema>;

// Payload yêu cầu gửi link đặt lại mật khẩu
export const forgotPasswordSchema = z.object({
  email: z.string().email("Email không hợp lệ"),
});

export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

// Payload đặt lại mật khẩu bằng token từ link
export const resetPasswordSchema = z.object({
  token: z.string().min(1, "Token không được để trống"),
  newPassword: z.string().min(8, "Mật khẩu tối thiểu 8 ký tự"),
});

export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

// Payload đổi mật khẩu khi đã đăng nhập
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Mật khẩu hiện tại không được để trống"),
  newPassword: z.string().min(8, "Mật khẩu tối thiểu 8 ký tự"),
});

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

// Payload tự sửa hồ sơ cá nhân — CỐ Ý chỉ 3 field này.
// Không cho đụng role/status/warehouseId (tự nâng quyền), cũng không cho đổi email
// (đổi email phải qua luồng verify lại, không thể sửa thẳng ở đây).
// avatarUrl nhận null để người dùng gỡ ảnh đại diện về mặc định.
export const updateMeSchema = z
  .object({
    fullName: z.string().min(1, "Họ tên không được để trống").max(255).optional(),
    phone: phoneSchema.nullable().optional(),
    avatarUrl: z.string().url("avatarUrl không hợp lệ").nullable().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "Cần gửi ít nhất một field để cập nhật",
  });

export type UpdateMeInput = z.infer<typeof updateMeSchema>;
