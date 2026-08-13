import { Router } from "express";
import { authenticate } from "../../middlewares/authenticate.js";
import { authorize } from "../../middlewares/authorize.js";
import { validate } from "../../middlewares/validate.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import {
  createUserSchema,
  listUsersQuerySchema,
  userIdParamSchema,
  updateUserSchema,
} from "./user.schema.js";
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

router.get(
  "/:id",
  authenticate,
  authorize("ADMIN", "WAREHOUSE_MANAGER"),
  validate(userIdParamSchema, "params"),
  asyncHandler(userController.getUserById)
);

router.patch(
  "/:id",
  authenticate,
  authorize("ADMIN", "WAREHOUSE_MANAGER"),
  validate(userIdParamSchema, "params"),
  validate(updateUserSchema, "body"),
  asyncHandler(userController.updateUser)
);

// CHỈ Admin, khác với 3 route trên (Manager cũng vào được) — xoá là thao tác không hoàn tác được
router.delete(
  "/:id",
  authenticate,
  authorize("ADMIN"),
  validate(userIdParamSchema, "params"),
  asyncHandler(userController.deleteUser)
);

export { router as userRouter };
