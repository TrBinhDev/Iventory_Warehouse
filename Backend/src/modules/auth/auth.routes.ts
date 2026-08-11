import { Router } from "express";
import { validate } from "../../middlewares/validate.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { registerSchema, loginSchema } from "./auth.schema.js";
import * as authController from "./auth.controller.js";

const router = Router();

router.post(
  "/register",
  validate(registerSchema, "body"),
  asyncHandler(authController.register)
);

router.post(
  "/login",
  validate(loginSchema, "body"),
  asyncHandler(authController.login)
);

export { router as authRouter };
