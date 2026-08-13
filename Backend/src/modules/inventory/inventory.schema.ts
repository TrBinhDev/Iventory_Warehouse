import { z } from "zod";

// Payload khởi tạo dòng tồn kho cho 1 cặp kho + SKU (luôn bắt đầu từ 0,
// số lượng chỉ thay đổi qua nghiệp vụ inbound/outbound/transfer/adjustment)
export const createInventorySchema = z.object({
  warehouseId: z.string().uuid("warehouseId không hợp lệ"),
  skuId: z.string().uuid("skuId không hợp lệ"),
});

export type CreateInventoryInput = z.infer<typeof createInventorySchema>;

// Query params cho danh sách tồn kho (phân trang + lọc kho/SKU + tìm theo mã SKU/tên sản phẩm).
// Manager/Staff bị ép cứng theo kho mình ở service, warehouseId gửi lên sẽ bị bỏ qua.
export const listInventoriesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  warehouseId: z.string().uuid("warehouseId không hợp lệ").optional(),
  skuId: z.string().uuid("skuId không hợp lệ").optional(),
  search: z.string().min(1).max(255).optional(),
});

export type ListInventoriesQuery = z.infer<typeof listInventoriesQuerySchema>;

// Param :id cho GET /inventories/:id
export const inventoryIdParamSchema = z.object({
  id: z.string().uuid("id không hợp lệ"),
});

export type InventoryIdParam = z.infer<typeof inventoryIdParamSchema>;
