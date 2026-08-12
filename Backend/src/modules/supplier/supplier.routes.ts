import { Router } from "express";
import { authenticate } from "../../middlewares/authenticate.js";
import { authorize } from "../../middlewares/authorize.js";
import { validate } from "../../middlewares/validate.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { createSupplierSchema } from "./supplier.schema.js";
import * as supplierController from "./supplier.controller.js";

const router = Router();

router.post(
  "/",
  authenticate,
  authorize("ADMIN"),
  validate(createSupplierSchema, "body"),
  asyncHandler(supplierController.createSupplier)
);

export { router as supplierRouter };
