import type { Request, Response } from "express";
import { HttpStatus } from "../../constants/httpStatus.js";
import { Message } from "../../constants/message.js";
import { BadRequestError } from "../../errors/appError.js";
import { sendSuccess } from "../../utils/response.util.js";
import * as reservationService from "./reservation.service.js";
import { idempotencyKeySchema } from "./reservation.schema.js";
import type { ReservationIdParam } from "./reservation.schema.js";

// Xử lý request tạo phiếu giữ chỗ — header đọc thẳng ở đây vì validate chỉ nhận body/query/params
export async function createReservation(req: Request, res: Response): Promise<void> {
  const parsed = idempotencyKeySchema.safeParse(req.header("Idempotency-Key"));
  if (!parsed.success) {
    throw new BadRequestError(
      Message.RESERVATION.MISSING_IDEMPOTENCY_KEY.message,
      Message.RESERVATION.MISSING_IDEMPOTENCY_KEY.code,
    );
  }

  const reservation = await reservationService.createReservation(
    req.user!,
    req.body,
    parsed.data,
  );

  sendSuccess(res, HttpStatus.CREATED, reservation);
}

// Xử lý request huỷ phiếu giữ chỗ
export async function cancelReservation(req: Request, res: Response): Promise<void> {
  const { id } = req.params as unknown as ReservationIdParam;
  const reservation = await reservationService.cancelReservation(req.user!, id, req.body);
  sendSuccess(res, HttpStatus.OK, reservation);
}
