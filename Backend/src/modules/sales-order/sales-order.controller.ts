import type { Request, Response } from "express";
import { HttpStatus } from "../../constants/httpStatus.js";
import { Message } from "../../constants/message.js";
import { BadRequestError } from "../../errors/appError.js";
import { sendSuccess } from "../../utils/response.util.js";
import * as salesOrderService from "./sales-order.service.js";
import { idempotencyKeySchema } from "./sales-order.schema.js";

// Đọc header Idempotency-Key — validate middleware chỉ nhận body/query/params nên đọc tay ở đây
function requireIdempotencyKey(req: Request): string {
  const parsed = idempotencyKeySchema.safeParse(req.header("Idempotency-Key"));

  if (!parsed.success) {
    throw new BadRequestError(
      Message.SALES_ORDER.MISSING_IDEMPOTENCY_KEY.message,
      Message.SALES_ORDER.MISSING_IDEMPOTENCY_KEY.code,
    );
  }

  return parsed.data;
}

// Xử lý request mua thẳng — khoá tồn và tăng reserved
export async function createSalesOrder(req: Request, res: Response): Promise<void> {
  const order = await salesOrderService.createSalesOrder(
    req.user!,
    req.body,
    requireIdempotencyKey(req),
  );

  sendSuccess(res, HttpStatus.CREATED, order);
}

// Xử lý request đặt mua từ phiếu giữ chỗ — không chạm tồn kho
export async function createSalesOrderFromReservation(
  req: Request,
  res: Response,
): Promise<void> {
  const order = await salesOrderService.createSalesOrderFromReservation(
    req.user!,
    req.body,
    requireIdempotencyKey(req),
  );

  sendSuccess(res, HttpStatus.CREATED, order);
}
