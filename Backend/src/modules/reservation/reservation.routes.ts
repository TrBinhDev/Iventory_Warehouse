import { Router } from "express";
import { authenticate } from "../../middlewares/authenticate.js";
import { authorize } from "../../middlewares/authorize.js";
import { validate } from "../../middlewares/validate.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import {
  cancelReservationSchema,
  createReservationSchema,
  reservationIdParamSchema,
} from "./reservation.schema.js";
import * as reservationController from "./reservation.controller.js";

const router = Router();

// Chỉ CUSTOMER — nhân viên không tạo hộ, customerId lấy từ token
router.post(
  "/",
  authenticate,
  authorize("CUSTOMER"),
  validate(createReservationSchema, "body"),
  asyncHandler(reservationController.createReservation)
);

// STAFF không được huỷ đơn của khách — nới quyền sau thì dễ, thu lại sau khi phát hành thì khó
router.patch(
  "/:id/cancel",
  authenticate,
  authorize("CUSTOMER", "WAREHOUSE_MANAGER", "ADMIN"),
  validate(reservationIdParamSchema, "params"),
  validate(cancelReservationSchema, "body"),
  asyncHandler(reservationController.cancelReservation)
);

export { router as reservationRouter };
