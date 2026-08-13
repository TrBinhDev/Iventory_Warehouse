-- Lưới an toàn tầng DB cho Inventory (phòng bug ở tầng code).
-- CHECK constraint không khai báo được qua Prisma schema nên thêm bằng raw SQL.
-- Thêm lúc bảng còn rỗng: ALTER ... ADD CONSTRAINT sẽ fail nếu đã tồn tại row vi phạm.

-- Tồn thực tế không bao giờ được âm
ALTER TABLE "Inventory"
  ADD CONSTRAINT "Inventory_quantityOnHand_non_negative"
  CHECK ("quantityOnHand" >= 0);

-- Số lượng giữ chỗ không bao giờ được âm
ALTER TABLE "Inventory"
  ADD CONSTRAINT "Inventory_quantityReserved_non_negative"
  CHECK ("quantityReserved" >= 0);

-- Không thể giữ chỗ nhiều hơn số hàng đang có
ALTER TABLE "Inventory"
  ADD CONSTRAINT "Inventory_quantityReserved_lte_onHand"
  CHECK ("quantityReserved" <= "quantityOnHand");
