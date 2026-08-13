import { Router } from "express";
import { authenticate } from "../../middlewares/authenticate.js";
import { authorize } from "../../middlewares/authorize.js";
import { validate } from "../../middlewares/validate.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import {
  createProductSchema,
  listProductsQuerySchema,
  productIdParamSchema,
  updateProductSchema,
  productIdRouteParamSchema,
  createSkuSchema,
  productSkuParamSchema,
  updateSkuSchema,
} from "./product.schema.js";
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

router.get(
  "/:id",
  validate(productIdParamSchema, "params"),
  asyncHandler(productController.getProductById)
);

router.patch(
  "/:id",
  authenticate,
  authorize("ADMIN"),
  validate(productIdParamSchema, "params"),
  validate(updateProductSchema, "body"),
  asyncHandler(productController.updateProduct)
);

router.delete(
  "/:id",
  authenticate,
  authorize("ADMIN"),
  validate(productIdParamSchema, "params"),
  asyncHandler(productController.deleteProduct)
);

router.post(
  "/:productId/skus",
  authenticate,
  authorize("ADMIN"),
  validate(productIdRouteParamSchema, "params"),
  validate(createSkuSchema, "body"),
  asyncHandler(productController.createSku)
);

router.get(
  "/:productId/skus",
  validate(productIdRouteParamSchema, "params"),
  asyncHandler(productController.getSkusByProduct)
);

router.get(
  "/:productId/skus/:skuId",
  validate(productSkuParamSchema, "params"),
  asyncHandler(productController.getSkuDetail)
);

router.patch(
  "/:productId/skus/:skuId",
  authenticate,
  authorize("ADMIN"),
  validate(productSkuParamSchema, "params"),
  validate(updateSkuSchema, "body"),
  asyncHandler(productController.updateSku)
);

router.delete(
  "/:productId/skus/:skuId",
  authenticate,
  authorize("ADMIN"),
  validate(productSkuParamSchema, "params"),
  asyncHandler(productController.deleteSku)
);

export { router as productRouter };
