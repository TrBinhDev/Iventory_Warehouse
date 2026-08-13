import type { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma.js";

// Field join tối thiểu cho màn danh sách — chỉ lấy đủ để hiển thị bảng,
// không kéo images/description/attributes cho nhẹ payload khi trả nhiều dòng
const LIST_INCLUDE = {
  warehouse: { select: { code: true, name: true } },
  sku: {
    select: {
      skuCode: true,
      product: { select: { id: true, name: true } },
    },
  },
} satisfies Prisma.InventoryInclude;

// Field join đầy đủ cho màn chi tiết — chỉ 1 dòng nên trả đủ để xem kỹ
const DETAIL_INCLUDE = {
  warehouse: { select: { code: true, name: true, address: true, status: true } },
  sku: {
    select: {
      skuCode: true,
      barcode: true,
      attributes: true,
      price: true,
      cost: true,
      weight: true,
      status: true,
      product: {
        select: { id: true, code: true, name: true, unit: true, description: true, images: true },
      },
    },
  },
} satisfies Prisma.InventoryInclude;

// Tìm dòng tồn theo id, kèm đầy đủ thông tin kho/SKU/sản phẩm
export function findById(id: string) {
  return prisma.inventory.findUnique({
    where: { id },
    include: DETAIL_INCLUDE,
  });
}

// Tìm dòng tồn theo cặp kho + SKU — dùng check trùng trước khi khởi tạo
export function findByWarehouseAndSku(warehouseId: string, skuId: string) {
  return prisma.inventory.findUnique({
    where: { warehouseId_skuId: { warehouseId, skuId } },
  });
}

// Check kho tồn tại trước khi khởi tạo dòng tồn
export function findWarehouseById(id: string) {
  return prisma.warehouse.findUnique({ where: { id } });
}

// Check SKU tồn tại trước khi khởi tạo dòng tồn
export function findSkuById(id: string) {
  return prisma.sKU.findUnique({ where: { id } });
}

// Lấy SKU kèm trạng thái sản phẩm — dùng cho API public, để không chào bán SKU/sản phẩm đã ngừng kinh doanh
export function findSkuWithProductStatus(id: string) {
  return prisma.sKU.findUnique({
    where: { id },
    select: {
      id: true,
      skuCode: true,
      status: true,
      product: { select: { status: true } },
    },
  });
}

// Lấy tồn kho của 1 SKU ở tất cả kho đang hoạt động — phục vụ API public.
// Không lọc available > 0 và không sắp xếp ở đây được: available là số tính runtime,
// Prisma không so sánh được 2 cột với nhau trong where, cũng không orderBy theo biểu thức.
// Số kho chỉ cỡ vài chục dòng nên lọc/sắp xếp ở tầng service không đáng kể.
export function findAvailabilityBySkuId(skuId: string) {
  return prisma.inventory.findMany({
    where: {
      skuId,
      warehouse: { status: "ACTIVE" },
    },
    select: {
      warehouseId: true,
      quantityOnHand: true,
      quantityReserved: true,
      warehouse: { select: { name: true, address: true } },
    },
  });
}

// Lấy danh sách tồn kho theo filter, có phân trang.
// Sắp xếp theo mã kho rồi mã SKU để tra cứu dễ (thứ tự tạo dòng tồn không có ý nghĩa với người xem)
export function findMany(where: Prisma.InventoryWhereInput, skip: number, take: number) {
  return prisma.inventory.findMany({
    where,
    skip,
    take,
    include: LIST_INCLUDE,
    orderBy: [{ warehouse: { code: "asc" } }, { sku: { skuCode: "asc" } }],
  });
}

// Đếm tổng số dòng tồn khớp filter — dùng cho meta phân trang
export function count(where: Prisma.InventoryWhereInput) {
  return prisma.inventory.count({ where });
}

// Đếm số biến động đã ghi cho dòng tồn này — dùng để chặn xoá.
// Có biến động nghĩa là dòng tồn đã từng được dùng thật (nhập/xuất/giữ chỗ), xoá đi là mất lịch sử.
export function countMovements(inventoryId: string) {
  return prisma.inventoryMovement.count({ where: { inventoryId } });
}

// Xoá hẳn dòng tồn kho — chỉ gọi khi đã chắc chưa có biến động nào
export function deleteInventory(id: string) {
  return prisma.inventory.delete({ where: { id } });
}

// Khởi tạo dòng tồn kho mới với số lượng 0 (chỉ INSERT, không đụng số lượng nên không cần transaction/lock)
export function createInventory(data: { warehouseId: string; skuId: string }) {
  return prisma.inventory.create({
    data,
    include: {
      warehouse: { select: { id: true, code: true, name: true } },
      sku: { select: { id: true, skuCode: true, barcode: true } },
    },
  });
}
