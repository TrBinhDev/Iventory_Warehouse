import { Router } from "express";
import { authenticate } from "../../middlewares/authenticate.js";
import { authorize } from "../../middlewares/authorize.js";
import { validate } from "../../middlewares/validate.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { createUserSchema, listUsersQuerySchema } from "./user.schema.js";
import * as userController from "./user.controller.js";

const router = Router();

router.post(
  "/",
  authenticate,
  authorize("ADMIN", "WAREHOUSE_MANAGER"),
  validate(createUserSchema, "body"),
  asyncHandler(userController.createUser)
);

router.get(
  "/",
  authenticate,
  authorize("ADMIN", "WAREHOUSE_MANAGER"),
  validate(listUsersQuerySchema, "query"),
  asyncHandler(userController.listUsers)
);

export { router as userRouter };
