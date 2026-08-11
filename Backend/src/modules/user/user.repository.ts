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

// Tìm user theo id, ẩn passwordHash
export function findByIdSafe(id: string) {
  return prisma.user.findUnique({ where: { id }, select: SAFE_USER_SELECT });
}

// Lấy danh sách tài khoản theo filter, có phân trang
export function findMany(where: Prisma.UserWhereInput, skip: number, take: number) {
  return prisma.user.findMany({
    where,
    select: SAFE_USER_SELECT,
    skip,
    take,
    orderBy: { createdAt: "desc" },
  });
}

// Đếm tổng số tài khoản khớp filter — dùng cho meta phân trang
export function count(where: Prisma.UserWhereInput) {
  return prisma.user.count({ where });
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

// Sửa tài khoản (partial update) — key nào undefined thì Prisma tự bỏ qua, không ghi đè.
// Dùng UncheckedUpdateInput để gán warehouseId trực tiếp (scalar FK) thay vì qua relation connect/disconnect.
export function updateUser(id: string, data: Prisma.UserUncheckedUpdateInput) {
  return prisma.user.update({ where: { id }, data, select: SAFE_USER_SELECT });
}
