import { Router } from "express";
import { authenticate } from "../../middlewares/authenticate.js";
import { authorize } from "../../middlewares/authorize.js";
import { validate } from "../../middlewares/validate.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import {
  createSupplierSchema,
  listSuppliersQuerySchema,
  supplierIdParamSchema,
} from "./supplier.schema.js";
import * as supplierController from "./supplier.controller.js";

const router = Router();

router.post(
  "/",
  authenticate,
  authorize("ADMIN"),
  validate(createSupplierSchema, "body"),
  asyncHandler(supplierController.createSupplier)
);

router.get(
  "/",
  authenticate,
  authorize("ADMIN", "WAREHOUSE_MANAGER", "WAREHOUSE_STAFF"),
  validate(listSuppliersQuerySchema, "query"),
  asyncHandler(supplierController.listSuppliers)
);

router.get(
  "/:id",
  authenticate,
  authorize("ADMIN", "WAREHOUSE_MANAGER", "WAREHOUSE_STAFF"),
  validate(supplierIdParamSchema, "params"),
  asyncHandler(supplierController.getSupplierById)
);

export { router as supplierRouter };
