import { prisma } from "../../config/prisma.js";

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
