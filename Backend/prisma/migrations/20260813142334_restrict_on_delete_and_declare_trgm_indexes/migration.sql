-- Đồng nhất hành vi xoá: mọi quan hệ đang là SET NULL đổi sang RESTRICT.
-- Lý do: SET NULL là mặc định Prisma sinh ra cho quan hệ optional, không phải lựa chọn có
-- chủ ý — và nó âm thầm phá dữ liệu lịch sử (xoá NCC làm phiếu nhập mất nguồn gốc, xoá kho
-- làm nhân viên mất kho, xoá user làm audit log mất dấu người thao tác).
-- Giữ nguyên 2 CASCADE của ProductCategory vì đó là bảng nối thuần, gỡ theo là đúng.
--
-- Phần RenameIndex: 3 index trgm trước đây tạo bằng raw SQL nên Prisma coi là lệch schema
-- và đòi DROP. Đã khai báo lại trong schema.prisma nên giờ chỉ đổi tên theo quy ước Prisma,
-- index vẫn nguyên.

-- DropForeignKey
ALTER TABLE "Inbound" DROP CONSTRAINT "Inbound_salesOrderId_fkey";

-- DropForeignKey
ALTER TABLE "Inbound" DROP CONSTRAINT "Inbound_supplierId_fkey";

-- DropForeignKey
ALTER TABLE "InventoryMovement" DROP CONSTRAINT "InventoryMovement_createdByUserId_fkey";

-- DropForeignKey
ALTER TABLE "Outbound" DROP CONSTRAINT "Outbound_salesOrderId_fkey";

-- DropForeignKey
ALTER TABLE "Outbound" DROP CONSTRAINT "Outbound_supplierId_fkey";

-- DropForeignKey
ALTER TABLE "SalesOrder" DROP CONSTRAINT "SalesOrder_reservationId_fkey";

-- DropForeignKey
ALTER TABLE "User" DROP CONSTRAINT "User_warehouseId_fkey";

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOrder" ADD CONSTRAINT "SalesOrder_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "Reservation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inbound" ADD CONSTRAINT "Inbound_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inbound" ADD CONSTRAINT "Inbound_salesOrderId_fkey" FOREIGN KEY ("salesOrderId") REFERENCES "SalesOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Outbound" ADD CONSTRAINT "Outbound_salesOrderId_fkey" FOREIGN KEY ("salesOrderId") REFERENCES "SalesOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Outbound" ADD CONSTRAINT "Outbound_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "Product_code_trgm_idx" RENAME TO "Product_code_idx";

-- RenameIndex
ALTER INDEX "Product_name_trgm_idx" RENAME TO "Product_name_idx";

-- RenameIndex
ALTER INDEX "SKU_skuCode_trgm_idx" RENAME TO "SKU_skuCode_idx";

