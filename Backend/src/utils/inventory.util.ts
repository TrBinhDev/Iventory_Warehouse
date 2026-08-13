// Bổ sung quantityAvailable vào object tồn kho — không lưu cột riêng trong DB,
// luôn tính runtime = onHand - reserved để tránh có thêm 1 nguồn số liệu có thể lệch (stale).
// Hàm thuần, không đụng DB, dùng chung cho mọi chỗ cần hiển thị số hàng còn đặt được.
export function withAvailable<T extends { quantityOnHand: number; quantityReserved: number }>(
  inventory: T
) {
  return {
    ...inventory,
    quantityAvailable: inventory.quantityOnHand - inventory.quantityReserved,
  };
}
