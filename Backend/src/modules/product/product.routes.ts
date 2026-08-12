import { Router } from "express";
import { authenticate } from "../../middlewares/authenticate.js";
import { authorize } from "../../middlewares/authorize.js";
import { validate } from "../../middlewares/validate.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { createProductSchema, listProductsQuerySchema } from "./product.schema.js";
import * as productController from "./product.controller.js";

const router = Router();

router.post(
  "/",
  authenticate,
  authorize("ADMIN"),
  validate(createProductSchema, "body"),
  asyncHandler(productController.createProduct)
);

router.get(
  "/",
  validate(listProductsQuerySchema, "query"),
  asyncHandler(productController.listProducts)
);

export { router as productRouter };
