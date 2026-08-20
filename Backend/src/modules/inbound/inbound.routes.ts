import { Router } from "express";
import { authenticate } from "../../middlewares/authenticate.js";
import { authorize } from "../../middlewares/authorize.js";
import { validate } from "../../middlewares/validate.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import {
  cancelInboundSchema,
  createInboundSchema,
  inboundIdParamSchema,
  listInboundsQuerySchema,
  receiveInboundSchema,
} from "./inbound.schema.js";
import * as inboundController from "./inbound.controller.js";

const router = Router();

// Module không có CUSTOMER — chỉ 3 role nhân viên đụng tới, không cần ABAC che theo customerId
const STAFF_ROLES = ["WAREHOUSE_STAFF", "WAREHOUSE_MANAGER", "ADMIN"] as const;

// Cả 3 role tạo được, ABAC ép đúng kho ở service (Staff/Manager không tạo hộ kho khác)
router.post(
  "/",
  authenticate,
  authorize(...STAFF_ROLES),
  validate(createInboundSchema, "body"),
  asyncHandler(inboundController.createInbound),
);

router.get(
  "/",
  authenticate,
  authorize(...STAFF_ROLES),
  validate(listInboundsQuerySchema, "query"),
  asyncHandler(inboundController.listInbounds),
);

router.get(
  "/:id",
  authenticate,
  authorize(...STAFF_ROLES),
  validate(inboundIdParamSchema, "params"),
  asyncHandler(inboundController.getInboundById),
);

// Duyệt phiếu — chỉ Manager/Admin, đây là quyết định phê chuẩn nên cần cấp trên
router.patch(
  "/:id/confirm",
  authenticate,
  authorize("WAREHOUSE_MANAGER", "ADMIN"),
  validate(inboundIdParamSchema, "params"),
  asyncHandler(inboundController.confirmInbound),
);

// Nhận hàng — cả 3 role, đây là ghi nhận sự thật vật lý nên để Staff (người đứng tại kho) làm
router.patch(
  "/:id/receive",
  authenticate,
  authorize(...STAFF_ROLES),
  validate(inboundIdParamSchema, "params"),
  validate(receiveInboundSchema, "body"),
  asyncHandler(inboundController.receiveInbound),
);

// Huỷ — ranh giới theo trạng thái xử lý ở service (DRAFT: cả 3 role; CONFIRMED: Manager/Admin)
router.patch(
  "/:id/cancel",
  authenticate,
  authorize(...STAFF_ROLES),
  validate(inboundIdParamSchema, "params"),
  validate(cancelInboundSchema, "body"),
  asyncHandler(inboundController.cancelInbound),
);

export { router as inboundRouter };
