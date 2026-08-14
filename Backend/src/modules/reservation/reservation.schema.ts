import { z } from "zod";

// Header Idempotency-Key Client sinh ra 1 UUID cho 1 ý định đặt hàng, dùng lại khi gửi lại
export const idempotencyKeySchema = z.uuid(
  "Idempotency-Key phải là UUID hợp lệ",
);

// Payload đặt phiếu giữ chỗ - CustomerId lấy từ token, không nhận từ body
export const createReservationSchema = z.object({
  warehouseId: z.uuid("warehouseId phải là UUID hợp lệ"),
  items: z.array(
    z.object({
      skuId: z.uuid("skuId phải là UUID hợp lệ"),
      quantity: z.number().int().positive("quantity phải là số nguyên dương"),
    }),
  )
  .min(1, "items phải có ít nhất 1 phần tử")
});

export type CreateReservationInput = z.infer<typeof createReservationSchema>;

// Param :id cho các route thao tác trên 1 phiếu
export const reservationIdParamSchema = z.object({
  id: z.uuid("id phải là UUID hợp lệ"),
});

export type ReservationIdParam = z.infer<typeof reservationIdParamSchema>;

// Body huỷ phiếu — lý do bắt buộc khi nhân viên huỷ đơn của khách, service kiểm theo role
export const cancelReservationSchema = z.object({
  cancelReason: z.string().trim().min(1).max(500).optional(),
});

export type CancelReservationInput = z.infer<typeof cancelReservationSchema>;