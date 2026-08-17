import { z } from "zod";

// Header Idempotency-Key — client sinh 1 UUID cho 1 ý định mua, dùng lại khi gửi lại
export const idempotencyKeySchema = z.uuid("Idempotency-Key phải là UUID hợp lệ");

// Body mua thẳng. customerId lấy từ token, totalAmount server tự tính — không nhận từ client
export const createSalesOrderSchema = z.object({
  warehouseId: z.uuid("warehouseId phải là UUID hợp lệ"),
  items: z
    .array(
      z.object({
        skuId: z.uuid("skuId phải là UUID hợp lệ"),
        quantity: z.number().int().positive("quantity phải là số nguyên dương"),
      }),
    )
    .min(1, "items phải có ít nhất 1 phần tử"),
});

export type CreateSalesOrderInput = z.infer<typeof createSalesOrderSchema>;

// Body đặt mua từ phiếu giữ chỗ — chỉ cần id phiếu, hàng và giá đọc từ ReservationItem.
// Tách endpoint riêng thay vì gộp vào schema trên: gộp thì client gửi được body lai
// (vừa reservationId vừa items) và server phải tự đoán ý, tách thì thứ đó không viết ra được.
export const createFromReservationSchema = z.object({
  reservationId: z.uuid("reservationId phải là UUID hợp lệ"),
});

export type CreateFromReservationInput = z.infer<typeof createFromReservationSchema>;

// Param :id cho các route thao tác trên 1 đơn
export const salesOrderIdParamSchema = z.object({
  id: z.uuid("id phải là UUID hợp lệ"),
});

export type SalesOrderIdParam = z.infer<typeof salesOrderIdParamSchema>;

// Body huỷ đơn — lý do bắt buộc khi nhân viên huỷ đơn của khách, service kiểm theo role
export const cancelSalesOrderSchema = z.object({
  cancelReason: z.string().trim().min(1).max(500).optional(),
});

export type CancelSalesOrderInput = z.infer<typeof cancelSalesOrderSchema>;

// Query danh sách đơn — Manager/Staff bị ép cứng kho mình ở service, warehouseId gửi lên bị bỏ qua
export const listSalesOrdersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z
    .enum(["PENDING", "PAID", "CONFIRMED", "COMPLETED", "CANCELLED", "REFUNDED"])
    .optional(),
  code: z.string().trim().min(1).max(30).optional(),
  warehouseId: z.uuid("warehouseId phải là UUID hợp lệ").optional(),
  skuId: z.uuid("skuId phải là UUID hợp lệ").optional(),
  // Hai cách tìm theo khách: gõ tên/email/số điện thoại vào một ô để tra, hoặc lọc chính xác
  // khi bấm từ trang khách hàng. Cả hai đều bị bỏ qua với role CUSTOMER — họ vốn chỉ thấy
  // đơn của chính mình.
  customer: z.string().trim().min(1).max(255).optional(),
  customerId: z.uuid("customerId phải là UUID hợp lệ").optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export type ListSalesOrdersQuery = z.infer<typeof listSalesOrdersQuerySchema>;
