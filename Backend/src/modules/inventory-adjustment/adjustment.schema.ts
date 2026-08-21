import { z } from "zod";

// Payload mở phiếu kiểm kê (DRAFT). quantityAfter là giá trị ĐẾM ĐƯỢC THỰC TẾ, không phải số
// chênh lệch. quantityBefore/expectedVersion KHÔNG nhận từ client — server tự snapshot từ
// Inventory hiện tại lúc tạo. Trùng skuId trong 1 phiếu bị TỪ CHỐI (không gộp được — 2 giá trị
// quantityAfter khác nhau cho cùng SKU là mâu thuẫn logic, không phải số cộng dồn).
export const createAdjustmentSchema = z.object({
  warehouseId: z.uuid("warehouseId phải là UUID hợp lệ"),
  reason: z.enum(["STOCK_COUNT", "DAMAGED", "LOST", "OTHER"]).default("STOCK_COUNT"),
  note: z.string().trim().max(500).optional(),
  items: z
    .array(
      z.object({
        skuId: z.uuid("skuId phải là UUID hợp lệ"),
        quantityAfter: z.number().int().nonnegative("quantityAfter không được âm"),
      }),
    )
    .min(1, "items phải có ít nhất 1 phần tử"),
});

export type CreateAdjustmentInput = z.infer<typeof createAdjustmentSchema>;

// Param :id dùng chung cho mọi route thao tác trên 1 phiếu
export const adjustmentIdParamSchema = z.object({
  id: z.uuid("id phải là UUID hợp lệ"),
});

export type AdjustmentIdParam = z.infer<typeof adjustmentIdParamSchema>;

// Query danh sách phiếu điều chỉnh — không có ô search gộp, cùng lý do inbound/outbound/transfer
export const listAdjustmentsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(["DRAFT", "COMPLETED"]).optional(),
  reason: z.enum(["STOCK_COUNT", "DAMAGED", "LOST", "OTHER"]).optional(),
  warehouseId: z.uuid("warehouseId phải là UUID hợp lệ").optional(),
  code: z.string().trim().min(1).max(30).optional(),
});

export type ListAdjustmentsQuery = z.infer<typeof listAdjustmentsQuerySchema>;
