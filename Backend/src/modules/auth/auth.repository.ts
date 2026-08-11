import type { Prisma, User } from "@prisma/client";
import { prisma } from "../../config/prisma.js";

// Các field an toàn để trả về client — luôn loại bỏ passwordHash
const SAFE_USER_SELECT = {
  id: true,
  role: true,
  warehouseId: true,
  fullName: true,
  email: true,
  isEmailVerified: true,
  phone: true,
  avatarUrl: true,
  status: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

export type SafeUser = Prisma.UserGetPayload<{ select: typeof SAFE_USER_SELECT }>;

// Tìm user theo email kèm passwordHash — chỉ dùng cho login/đổi mật khẩu
export function findByEmailWithPassword(email: string) {
  return prisma.user.findUnique({ where: { email } });
}

// Tìm user theo email, ẩn passwordHash — dùng khi chỉ cần check tồn tại/hiển thị
export function findByEmailSafe(email: string) {
  return prisma.user.findUnique({ where: { email }, select: SAFE_USER_SELECT });
}

// Bỏ passwordHash khỏi User đầy đủ trước khi trả về client
export function toSafeUser(user: User): SafeUser {
  const { passwordHash: _passwordHash, ...safe } = user;
  return safe;
}

// Ghi nhận thời điểm đăng nhập gần nhất
export function updateLastLogin(userId: string) {
  return prisma.user.update({
    where: { id: userId },
    data: { lastLoginAt: new Date() },
    select: SAFE_USER_SELECT,
  });
}

// Đánh dấu email đã được xác thực sau khi verify OTP thành công
export function markEmailVerified(userId: string) {
  return prisma.user.update({
    where: { id: userId },
    data: { isEmailVerified: true },
    select: SAFE_USER_SELECT,
  });
}

// Tạo tài khoản Customer tự đăng ký (role cố định, chưa gắn warehouse, chưa verify email)
export function createCustomer(data: {
  email: string;
  passwordHash: string;
  fullName: string;
  phone?: string;
}) {
  return prisma.user.create({
    data: {
      role: "CUSTOMER",
      warehouseId: null,
      email: data.email,
      passwordHash: data.passwordHash,
      fullName: data.fullName,
      phone: data.phone,
      isEmailVerified: false,
    },
    select: SAFE_USER_SELECT,
  });
}
