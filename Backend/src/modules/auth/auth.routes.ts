import { Router } from "express";
import { validate } from "../../middlewares/validate.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { registerSchema } from "./auth.schema.js";
import * as authController from "./auth.controller.js";

const router = Router();

router.post(
  "/register",
  validate(registerSchema, "body"),
  asyncHandler(authController.register)
);

export { router as authRouter };
