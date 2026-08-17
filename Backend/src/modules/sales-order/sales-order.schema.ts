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
