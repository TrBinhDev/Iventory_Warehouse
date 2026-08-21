import { z } from "zod";

// Payload tạo phiếu chuyển kho (DRAFT). fromWarehouseId !== toWarehouseId check ở service
// (DB không tự chặn được chuyển kho tới chính nó). Dòng trùng skuId được GỘP lại ở service
// trước khi ghi (TransferItem không có giá riêng từng dòng, khác InboundItem).
export const createTransferSchema = z.object({
  fromWarehouseId: z.uuid("fromWarehouseId phải là UUID hợp lệ"),
  toWarehouseId: z.uuid("toWarehouseId phải là UUID hợp lệ"),
  items: z
    .array(
      z.object({
        skuId: z.uuid("skuId phải là UUID hợp lệ"),
        quantity: z.number().int().positive("quantity phải là số nguyên dương"),
      }),
    )
    .min(1, "items phải có ít nhất 1 phần tử"),
});

export type CreateTransferInput = z.infer<typeof createTransferSchema>;

// Param :id dùng chung cho mọi route thao tác trên 1 phiếu
export const transferIdParamSchema = z.object({
  id: z.uuid("id phải là UUID hợp lệ"),
});

export type TransferIdParam = z.infer<typeof transferIdParamSchema>;

// Body bước receive — định danh theo skuId (không phải itemId): items đã gộp duy nhất 1
// dòng/SKU lúc tạo nên skuId đủ để định danh không mơ hồ, khác inbound (có thể nhiều dòng
// cùng SKU khác lô/giá nên phải dùng itemId). BẮT BUỘC gửi đủ mọi SKU trong phiếu.
// quantityReceived cho phép 0 (hàng thất thoát hết trên đường), chỉ chặn số âm.
export const receiveTransferSchema = z.object({
  items: z
    .array(
      z.object({
        skuId: z.uuid("skuId phải là UUID hợp lệ"),
        quantityReceived: z.number().int().nonnegative("quantityReceived không được âm"),
      }),
    )
    .min(1, "items phải có ít nhất 1 phần tử"),
});

export type ReceiveTransferInput = z.infer<typeof receiveTransferSchema>;

// Body huỷ phiếu — lý do không bắt buộc, cùng khuôn inbound/outbound
export const cancelTransferSchema = z.object({
  cancelReason: z.string().trim().min(1).max(500).optional(),
});

export type CancelTransferInput = z.infer<typeof cancelTransferSchema>;

// Query danh sách phiếu chuyển kho — không có ô search gộp, cùng lý do inbound/outbound
export const listTransfersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(["DRAFT", "CONFIRMED", "SHIPPED", "RECEIVED", "CANCELLED"]).optional(),
  fromWarehouseId: z.uuid("fromWarehouseId phải là UUID hợp lệ").optional(),
  toWarehouseId: z.uuid("toWarehouseId phải là UUID hợp lệ").optional(),
  code: z.string().trim().min(1).max(30).optional(),
});

export type ListTransfersQuery = z.infer<typeof listTransfersQuerySchema>;
