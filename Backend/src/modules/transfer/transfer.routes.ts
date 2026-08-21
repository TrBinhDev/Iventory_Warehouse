import { Router } from "express";
import { authenticate } from "../../middlewares/authenticate.js";
import { authorize } from "../../middlewares/authorize.js";
import { validate } from "../../middlewares/validate.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import {
  cancelTransferSchema,
  createTransferSchema,
  listTransfersQuerySchema,
  receiveTransferSchema,
  transferIdParamSchema,
} from "./transfer.schema.js";
import * as transferController from "./transfer.controller.js";

const router = Router();

// Module không có CUSTOMER — chỉ 3 role nhân viên đụng tới, cùng khuôn inbound/outbound
const STAFF_ROLES = ["WAREHOUSE_STAFF", "WAREHOUSE_MANAGER", "ADMIN"] as const;

router.post(
  "/",
  authenticate,
  authorize(...STAFF_ROLES),
  validate(createTransferSchema, "body"),
  asyncHandler(transferController.createTransfer),
);

router.get(
  "/",
  authenticate,
  authorize(...STAFF_ROLES),
  validate(listTransfersQuerySchema, "query"),
  asyncHandler(transferController.listTransfers),
);

router.get(
  "/:id",
  authenticate,
  authorize(...STAFF_ROLES),
  validate(transferIdParamSchema, "params"),
  asyncHandler(transferController.getTransferById),
);

// Duyệt phiếu — chỉ Manager/Admin (kho nguồn), quyết định phê chuẩn nên cần cấp trên
router.patch(
  "/:id/confirm",
  authenticate,
  authorize("WAREHOUSE_MANAGER", "ADMIN"),
  validate(transferIdParamSchema, "params"),
  asyncHandler(transferController.confirmTransfer),
);

// Xuất hàng ở kho nguồn — cả 3 role, ghi nhận sự thật vật lý nên để Staff làm
router.patch(
  "/:id/ship",
  authenticate,
  authorize(...STAFF_ROLES),
  validate(transferIdParamSchema, "params"),
  asyncHandler(transferController.shipTransfer),
);

// Nhận hàng ở kho đích — cả 3 role, ABAC ép đúng kho đích ở service (khác kho nguồn ở ship)
router.patch(
  "/:id/receive",
  authenticate,
  authorize(...STAFF_ROLES),
  validate(transferIdParamSchema, "params"),
  validate(receiveTransferSchema, "body"),
  asyncHandler(transferController.receiveTransfer),
);

// Huỷ — ranh giới theo trạng thái xử lý ở service (DRAFT: cả 3 role; CONFIRMED: Manager/Admin)
router.patch(
  "/:id/cancel",
  authenticate,
  authorize(...STAFF_ROLES),
  validate(transferIdParamSchema, "params"),
  validate(cancelTransferSchema, "body"),
  asyncHandler(transferController.cancelTransfer),
);

export { router as transferRouter };
