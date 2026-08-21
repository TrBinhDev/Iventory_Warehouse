import { Router } from "express";
import { authenticate } from "../../middlewares/authenticate.js";
import { authorize } from "../../middlewares/authorize.js";
import { validate } from "../../middlewares/validate.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import {
  cancelOutboundSchema,
  createOutboundSchema,
  listOutboundsQuerySchema,
  outboundIdParamSchema,
} from "./outbound.schema.js";
import * as outboundController from "./outbound.controller.js";

const router = Router();

// Module không có CUSTOMER — chỉ 3 role nhân viên đụng tới, cùng khuôn inbound
const STAFF_ROLES = ["WAREHOUSE_STAFF", "WAREHOUSE_MANAGER", "ADMIN"] as const;

router.post(
  "/",
  authenticate,
  authorize(...STAFF_ROLES),
  validate(createOutboundSchema, "body"),
  asyncHandler(outboundController.createOutbound),
);

router.get(
  "/",
  authenticate,
  authorize(...STAFF_ROLES),
  validate(listOutboundsQuerySchema, "query"),
  asyncHandler(outboundController.listOutbounds),
);

router.get(
  "/:id",
  authenticate,
  authorize(...STAFF_ROLES),
  validate(outboundIdParamSchema, "params"),
  asyncHandler(outboundController.getOutboundById),
);

// Duyệt phiếu — chỉ Manager/Admin, quyết định phê chuẩn nên cần cấp trên
router.patch(
  "/:id/confirm",
  authenticate,
  authorize("WAREHOUSE_MANAGER", "ADMIN"),
  validate(outboundIdParamSchema, "params"),
  asyncHandler(outboundController.confirmOutbound),
);

// Xuất hàng — cả 3 role, ghi nhận sự thật vật lý nên để Staff (người đứng tại kho) làm
router.patch(
  "/:id/ship",
  authenticate,
  authorize(...STAFF_ROLES),
  validate(outboundIdParamSchema, "params"),
  asyncHandler(outboundController.shipOutbound),
);

// Huỷ — ranh giới theo trạng thái xử lý ở service (DRAFT: cả 3 role; CONFIRMED: Manager/Admin)
router.patch(
  "/:id/cancel",
  authenticate,
  authorize(...STAFF_ROLES),
  validate(outboundIdParamSchema, "params"),
  validate(cancelOutboundSchema, "body"),
  asyncHandler(outboundController.cancelOutbound),
);

export { router as outboundRouter };
