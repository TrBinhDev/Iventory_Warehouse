import { z } from "zod";

// Payload khởi tạo dòng tồn kho cho 1 cặp kho + SKU (luôn bắt đầu từ 0,
// số lượng chỉ thay đổi qua nghiệp vụ inbound/outbound/transfer/adjustment)
export const createInventorySchema = z.object({
  warehouseId: z.string().uuid("warehouseId không hợp lệ"),
  skuId: z.string().uuid("skuId không hợp lệ"),
});

export type CreateInventoryInput = z.infer<typeof createInventorySchema>;
