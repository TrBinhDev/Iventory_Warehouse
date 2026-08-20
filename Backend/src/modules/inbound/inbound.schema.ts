import { z } from "zod";
import { decimalStringSchema } from "../../utils/decimal.util.js";

// Payload tạo phiếu nhập (DRAFT) — reason quyết định supplierId/salesOrderId bắt buộc cái nào,
// việc đó check ở service (không phải DB constraint) để trả đúng message theo từng trường hợp
export const createInboundSchema = z.object({
  warehouseId: z.uuid("warehouseId phải là UUID hợp lệ"),
  reason: z.enum(["FROM_SUPPLIER", "CUSTOMER_RETURN"]).default("FROM_SUPPLIER"),
  supplierId: z.uuid("supplierId phải là UUID hợp lệ").optional(),
  salesOrderId: z.uuid("salesOrderId phải là UUID hợp lệ").optional(),
  items: z
    .array(
      z.object({
        skuId: z.uuid("skuId phải là UUID hợp lệ"),
        quantityOrdered: z.number().int().positive("quantityOrdered phải là số nguyên dương"),
        // Snapshot giá nhập tại thời điểm này — không lấy SKU.cost hiện tại
        unitCost: decimalStringSchema(2, "unitCost không hợp lệ (số, tối đa 2 chữ số thập phân)"),
        note: z.string().trim().max(500).optional(),
      }),
    )
    .min(1, "items phải có ít nhất 1 phần tử"),
});

export type CreateInboundInput = z.infer<typeof createInboundSchema>;

// Param :id dùng chung cho mọi route thao tác trên 1 phiếu
export const inboundIdParamSchema = z.object({
  id: z.uuid("id phải là UUID hợp lệ"),
});

export type InboundIdParam = z.infer<typeof inboundIdParamSchema>;

// Body bước receive — định danh theo itemId (InboundItem.id), KHÔNG phải skuId: 1 phiếu có thể
// có 2 dòng cùng skuId (2 lô khác đơn giá), skuId không đủ để tách dòng nào là dòng nào.
// BẮT BUỘC gửi đủ mọi item trong phiếu, không suy luận ngầm số thiếu.
// quantityReceived cho phép 0 (hàng không về), chỉ chặn số âm.
export const receiveInboundSchema = z.object({
  items: z
    .array(
      z.object({
        itemId: z.uuid("itemId phải là UUID hợp lệ"),
        quantityReceived: z.number().int().nonnegative("quantityReceived không được âm"),
      }),
    )
    .min(1, "items phải có ít nhất 1 phần tử"),
});

export type ReceiveInboundInput = z.infer<typeof receiveInboundSchema>;

// Body huỷ phiếu — lý do không bắt buộc (khác sales-order: người tạo và người huỷ đều là nhân viên)
export const cancelInboundSchema = z.object({
  cancelReason: z.string().trim().min(1).max(500).optional(),
});

export type CancelInboundInput = z.infer<typeof cancelInboundSchema>;

// Query danh sách phiếu nhập — không có ô search gộp vì bảng không có cột định danh dạng
// tên/email/sđt để gộp (khác reservation/sales-order); code lọc contains cần trigram riêng
export const listInboundsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(["DRAFT", "CONFIRMED", "RECEIVED", "CANCELLED"]).optional(),
  reason: z.enum(["FROM_SUPPLIER", "CUSTOMER_RETURN"]).optional(),
  warehouseId: z.uuid("warehouseId phải là UUID hợp lệ").optional(),
  supplierId: z.uuid("supplierId phải là UUID hợp lệ").optional(),
  code: z.string().trim().min(1).max(30).optional(),
});

export type ListInboundsQuery = z.infer<typeof listInboundsQuerySchema>;
