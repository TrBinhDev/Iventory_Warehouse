import { Router } from "express";
import { authenticate } from "../../middlewares/authenticate.js";
import { authorize } from "../../middlewares/authorize.js";
import { validate } from "../../middlewares/validate.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { createReservationSchema } from "./reservation.schema.js";
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

export { router as reservationRouter };
