import { Router } from "express";
import { authenticate } from "../../middlewares/authenticate.js";
import { authorize } from "../../middlewares/authorize.js";
import { validate } from "../../middlewares/validate.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { createWarehouseSchema } from "./warehouse.schema.js";
import * as warehouseController from "./warehouse.controller.js";

const router = Router();

router.post(
  "/",
  authenticate,
  authorize("ADMIN"),
  validate(createWarehouseSchema, "body"),
  asyncHandler(warehouseController.createWarehouse)
);

export { router as warehouseRouter };
