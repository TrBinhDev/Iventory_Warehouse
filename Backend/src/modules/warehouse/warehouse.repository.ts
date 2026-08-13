import type { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma.js";

// Tìm kho theo code — dùng để check trùng lúc tạo
export function findByCode(code: string) {
  return prisma.warehouse.findUnique({ where: { code } });
}

// Tìm kho theo id
export function findById(id: string) {
  return prisma.warehouse.findUnique({ where: { id } });
}

// Sửa kho (partial update)
export function updateWarehouse(id: string, data: Prisma.WarehouseUpdateInput) {
  return prisma.warehouse.update({ where: { id }, data });
}

// Lấy danh sách kho theo filter, có phân trang
export function findMany(where: Prisma.WarehouseWhereInput, skip: number, take: number) {
  return prisma.warehouse.findMany({
    where,
    skip,
    take,
    orderBy: { createdAt: "desc" },
  });
}

// Đếm tổng số kho khớp filter — dùng cho meta phân trang
export function count(where: Prisma.WarehouseWhereInput) {
  return prisma.warehouse.count({ where });
}

// Tạo kho mới
export function createWarehouse(data: {
  code: string;
  name: string;
  address?: string;
  phone?: string;
}) {
  return prisma.warehouse.create({ data });
}

// Đếm mọi thứ còn tham chiếu tới kho này — dùng để chặn xoá.
// Transfer đếm cả 2 chiều (kho nguồn và kho đích) vì phiếu chuyển kho trỏ tới 2 kho khác nhau.
// 8 truy vấn độc lập nên chạy song song.
export async function countReferences(warehouseId: string) {
  const [user, inventory, reservation, salesOrder, inbound, outbound, transfer, adjustment] =
    await Promise.all([
      prisma.user.count({ where: { warehouseId } }),
      prisma.inventory.count({ where: { warehouseId } }),
      prisma.reservation.count({ where: { warehouseId } }),
      prisma.salesOrder.count({ where: { warehouseId } }),
      prisma.inbound.count({ where: { warehouseId } }),
      prisma.outbound.count({ where: { warehouseId } }),
      prisma.transfer.count({
        where: { OR: [{ fromWarehouseId: warehouseId }, { toWarehouseId: warehouseId }] },
      }),
      prisma.inventoryAdjustment.count({ where: { warehouseId } }),
    ]);

  return { user, inventory, reservation, salesOrder, inbound, outbound, transfer, adjustment };
}

// Xoá hẳn kho — chỉ gọi khi đã chắc không còn gì tham chiếu
export function deleteWarehouse(id: string) {
  return prisma.warehouse.delete({ where: { id } });
}
