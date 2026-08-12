import { Router } from "express";
import { authenticate } from "../../middlewares/authenticate.js";
import { authorize } from "../../middlewares/authorize.js";
import { validate } from "../../middlewares/validate.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import {
  createCategorySchema,
  listCategoriesQuerySchema,
  categoryIdParamSchema,
  updateCategorySchema,
} from "./category.schema.js";
import * as categoryController from "./category.controller.js";

const router = Router();

router.post(
  "/",
  authenticate,
  authorize("ADMIN"),
  validate(createCategorySchema, "body"),
  asyncHandler(categoryController.createCategory)
);

router.get(
  "/",
  validate(listCategoriesQuerySchema, "query"),
  asyncHandler(categoryController.listCategories)
);

router.get(
  "/:id",
  validate(categoryIdParamSchema, "params"),
  asyncHandler(categoryController.getCategoryById)
);

router.patch(
  "/:id",
  authenticate,
  authorize("ADMIN"),
  validate(categoryIdParamSchema, "params"),
  validate(updateCategorySchema, "body"),
  asyncHandler(categoryController.updateCategory)
);

export { router as categoryRouter };
