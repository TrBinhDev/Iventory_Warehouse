import { Router } from "express";
import { authenticate } from "../../middlewares/authenticate.js";
import { authorize } from "../../middlewares/authorize.js";
import { validate } from "../../middlewares/validate.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { createInventorySchema } from "./inventory.schema.js";
import * as inventoryController from "./inventory.controller.js";

const router = Router();

router.post(
  "/",
  authenticate,
  authorize("ADMIN", "WAREHOUSE_MANAGER"),
  validate(createInventorySchema, "body"),
  asyncHandler(inventoryController.createInventory)
);

export { router as inventoryRouter };
