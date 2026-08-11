import type { Prisma, UserRole } from "@prisma/client";
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

// Tìm user theo email — dùng để check trùng lúc tạo tài khoản
export function findByEmail(email: string) {
  return prisma.user.findUnique({ where: { email } });
}

// Tạo tài khoản Admin/Manager/Staff — isEmailVerified=true ngay (Admin/Manager tự chịu trách nhiệm email đúng)
export function createUser(data: {
  fullName: string;
  email: string;
  passwordHash: string;
  phone?: string;
  role: UserRole;
  warehouseId: string | null;
}) {
  return prisma.user.create({
    data: {
      fullName: data.fullName,
      email: data.email,
      passwordHash: data.passwordHash,
      phone: data.phone,
      role: data.role,
      warehouseId: data.warehouseId,
      isEmailVerified: true,
    },
    select: SAFE_USER_SELECT,
  });
}
