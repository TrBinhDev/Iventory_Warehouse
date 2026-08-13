import { Router } from "express";
import { authenticate } from "../../middlewares/authenticate.js";
import { authorize } from "../../middlewares/authorize.js";
import { validate } from "../../middlewares/validate.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import {
  createInventorySchema,
  listInventoriesQuerySchema,
  inventoryIdParamSchema,
  availabilityQuerySchema,
} from "./inventory.schema.js";
import * as inventoryController from "./inventory.controller.js";

const router = Router();

router.post(
  "/",
  authenticate,
  authorize("ADMIN", "WAREHOUSE_MANAGER"),
  validate(createInventorySchema, "body"),
  asyncHandler(inventoryController.createInventory)
);

router.get(
  "/",
  authenticate,
  authorize("ADMIN", "WAREHOUSE_MANAGER", "WAREHOUSE_STAFF"),
  validate(listInventoriesQuerySchema, "query"),
  asyncHandler(inventoryController.listInventories)
);

// PHẢI khai báo trước "/:id" — Express khớp route theo thứ tự, để sau thì "availability"
// bị hiểu nhầm thành giá trị của :id rồi rớt ở bước validate UUID
router.get(
  "/availability",
  validate(availabilityQuerySchema, "query"),
  asyncHandler(inventoryController.getAvailability)
);

router.get(
  "/:id",
  authenticate,
  authorize("ADMIN", "WAREHOUSE_MANAGER", "WAREHOUSE_STAFF"),
  validate(inventoryIdParamSchema, "params"),
  asyncHandler(inventoryController.getInventoryById)
);

router.delete(
  "/:id",
  authenticate,
  authorize("ADMIN"),
  validate(inventoryIdParamSchema, "params"),
  asyncHandler(inventoryController.deleteInventory)
);

export { router as inventoryRouter };
