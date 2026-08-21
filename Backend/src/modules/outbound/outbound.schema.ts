import { z } from "zod";

const outboundItemSchema = z.object({
  skuId: z.uuid("skuId phải là UUID hợp lệ"),
  quantity: z.number().int().positive("quantity phải là số nguyên dương"),
});

// Payload tạo phiếu xuất (DRAFT). reason quyết định salesOrderId/supplierId/items bắt buộc
// cái nào — check ở service (không phải DB constraint):
//   SALES_ORDER: salesOrderId bắt buộc, items KHÔNG được gửi (tự lấy từ SalesOrderItem)
//   RETURN_TO_SUPPLIER: supplierId bắt buộc, items bắt buộc
//   DAMAGED/OTHER: cả 2 đều cấm, items bắt buộc; OTHER thêm note bắt buộc
export const createOutboundSchema = z.object({
  warehouseId: z.uuid("warehouseId phải là UUID hợp lệ"),
  reason: z.enum(["SALES_ORDER", "RETURN_TO_SUPPLIER", "DAMAGED", "OTHER"]).default("SALES_ORDER"),
  salesOrderId: z.uuid("salesOrderId phải là UUID hợp lệ").optional(),
  supplierId: z.uuid("supplierId phải là UUID hợp lệ").optional(),
  note: z.string().trim().max(500).optional(),
  items: z.array(outboundItemSchema).min(1, "items phải có ít nhất 1 phần tử").optional(),
});

export type CreateOutboundInput = z.infer<typeof createOutboundSchema>;

// Param :id dùng chung cho mọi route thao tác trên 1 phiếu
export const outboundIdParamSchema = z.object({
  id: z.uuid("id phải là UUID hợp lệ"),
});

export type OutboundIdParam = z.infer<typeof outboundIdParamSchema>;

// Body huỷ phiếu — lý do không bắt buộc, cùng khuôn inbound
export const cancelOutboundSchema = z.object({
  cancelReason: z.string().trim().min(1).max(500).optional(),
});

export type CancelOutboundInput = z.infer<typeof cancelOutboundSchema>;

// Query danh sách phiếu xuất — không có ô search gộp, cùng lý do inbound
export const listOutboundsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(["DRAFT", "CONFIRMED", "SHIPPED", "CANCELLED"]).optional(),
  reason: z.enum(["SALES_ORDER", "RETURN_TO_SUPPLIER", "DAMAGED", "OTHER"]).optional(),
  warehouseId: z.uuid("warehouseId phải là UUID hợp lệ").optional(),
  salesOrderId: z.uuid("salesOrderId phải là UUID hợp lệ").optional(),
  supplierId: z.uuid("supplierId phải là UUID hợp lệ").optional(),
  code: z.string().trim().min(1).max(30).optional(),
});

export type ListOutboundsQuery = z.infer<typeof listOutboundsQuerySchema>;
