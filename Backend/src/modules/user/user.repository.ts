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

// Đếm mọi thứ còn tham chiếu tới tài khoản này — dùng để chặn xoá.
// User xuất hiện ở 2 vai: khách đặt hàng (Reservation/SalesOrder) và nhân viên tạo phiếu
// (Inbound/Outbound/Transfer/Adjustment), cộng thêm dấu vết trong audit log InventoryMovement.
export async function countReferences(userId: string) {
  const [reservation, salesOrder, inbound, outbound, transfer, adjustment, movement] =
    await Promise.all([
      // OR vì User nối tới Reservation bằng 2 đường: người đặt và người bấm huỷ.
      // Không phải để chống 500 — người huỷ luôn kèm 1 InventoryMovement nên mục movement
      // dưới đây đã chặn được họ. OR ở đây là để 409 gọi đúng tên thứ đang vướng
      // ("1 phiếu giữ chỗ") thay vì chỉ báo chung chung là "biến động tồn kho".
      prisma.reservation.count({
        where: { OR: [{ customerId: userId }, { cancelledByUserId: userId }] },
      }),
      prisma.salesOrder.count({ where: { customerId: userId } }),
      prisma.inbound.count({ where: { createdByUserId: userId } }),
      prisma.outbound.count({ where: { createdByUserId: userId } }),
      prisma.transfer.count({ where: { createdByUserId: userId } }),
      prisma.inventoryAdjustment.count({ where: { createdByUserId: userId } }),
      prisma.inventoryMovement.count({ where: { createdByUserId: userId } }),
    ]);

  return { reservation, salesOrder, inbound, outbound, transfer, adjustment, movement };
}

// Xoá hẳn tài khoản — chỉ gọi khi đã chắc không còn gì tham chiếu
export function deleteUser(id: string) {
  return prisma.user.delete({ where: { id } });
}
