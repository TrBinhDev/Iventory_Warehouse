import { Router } from "express";
import { authenticate } from "../../middlewares/authenticate.js";
import { authorize } from "../../middlewares/authorize.js";
import { validate } from "../../middlewares/validate.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import {
  createWarehouseSchema,
  listWarehousesQuerySchema,
  warehouseIdParamSchema,
  updateWarehouseSchema,
} from "./warehouse.schema.js";
import * as warehouseController from "./warehouse.controller.js";

const router = Router();

router.post(
  "/",
  authenticate,
  authorize("ADMIN"),
  validate(createWarehouseSchema, "body"),
  asyncHandler(warehouseController.createWarehouse)
);

router.get(
  "/",
  validate(listWarehousesQuerySchema, "query"),
  asyncHandler(warehouseController.listWarehouses)
);

router.get(
  "/:id",
  validate(warehouseIdParamSchema, "params"),
  asyncHandler(warehouseController.getWarehouseById)
);

router.patch(
  "/:id",
  authenticate,
  authorize("ADMIN"),
  validate(warehouseIdParamSchema, "params"),
  validate(updateWarehouseSchema, "body"),
  asyncHandler(warehouseController.updateWarehouse)
);

router.delete(
  "/:id",
  authenticate,
  authorize("ADMIN"),
  validate(warehouseIdParamSchema, "params"),
  asyncHandler(warehouseController.deleteWarehouse)
);

export { router as warehouseRouter };
