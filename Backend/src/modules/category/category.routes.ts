import { Router } from "express";
import { authenticate } from "../../middlewares/authenticate.js";
import { authorize } from "../../middlewares/authorize.js";
import { validate } from "../../middlewares/validate.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { createCategorySchema } from "./category.schema.js";
import * as categoryController from "./category.controller.js";

const router = Router();

router.post(
  "/",
  authenticate,
  authorize("ADMIN"),
  validate(createCategorySchema, "body"),
  asyncHandler(categoryController.createCategory)
);

export { router as categoryRouter };
