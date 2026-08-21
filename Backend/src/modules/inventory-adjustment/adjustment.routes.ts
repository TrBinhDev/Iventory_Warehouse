import { Router } from "express";
import { authenticate } from "../../middlewares/authenticate.js";
import { authorize } from "../../middlewares/authorize.js";
import { validate } from "../../middlewares/validate.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import {
  adjustmentIdParamSchema,
  createAdjustmentSchema,
  listAdjustmentsQuerySchema,
} from "./adjustment.schema.js";
import * as adjustmentController from "./adjustment.controller.js";

const router = Router();

// Chỉ Manager/Admin ở MỌI route — kể cả xem, kể cả Staff cũng không được (khác 3 module trước
// đều cho Staff làm bước vật lý). Kiểm soát nội bộ: người cầm hàng không tự sửa sổ được.
const MANAGER_ROLES = ["WAREHOUSE_MANAGER", "ADMIN"] as const;

router.post(
  "/",
  authenticate,
  authorize(...MANAGER_ROLES),
  validate(createAdjustmentSchema, "body"),
  asyncHandler(adjustmentController.createAdjustment),
);

router.get(
  "/",
  authenticate,
  authorize(...MANAGER_ROLES),
  validate(listAdjustmentsQuerySchema, "query"),
  asyncHandler(adjustmentController.listAdjustments),
);

router.get(
  "/:id",
  authenticate,
  authorize(...MANAGER_ROLES),
  validate(adjustmentIdParamSchema, "params"),
  asyncHandler(adjustmentController.getAdjustmentById),
);

// Hoàn tất — bước duy nhất chạm Inventory, khoá optimistic (version)
router.patch(
  "/:id/complete",
  authenticate,
  authorize(...MANAGER_ROLES),
  validate(adjustmentIdParamSchema, "params"),
  asyncHandler(adjustmentController.completeAdjustment),
);

// Xoá — chỉ cho phiếu còn DRAFT (enum không có CANCELLED, xoá cứng là cách duy nhất dọn)
router.delete(
  "/:id",
  authenticate,
  authorize(...MANAGER_ROLES),
  validate(adjustmentIdParamSchema, "params"),
  asyncHandler(adjustmentController.deleteAdjustment),
);

export { router as inventoryAdjustmentRouter };
