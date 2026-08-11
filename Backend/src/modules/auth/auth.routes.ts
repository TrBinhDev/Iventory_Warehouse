import { Router } from "express";
import { validate } from "../../middlewares/validate.js";
import { authenticate } from "../../middlewares/authenticate.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import {
  registerSchema,
  loginSchema,
  verifyEmailSchema,
  resendVerificationSchema,
  forgotPasswordSchema,
} from "./auth.schema.js";
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

router.post("/refresh", asyncHandler(authController.refresh));

router.post("/logout", authenticate, asyncHandler(authController.logout));

router.get("/me", authenticate, asyncHandler(authController.me));

router.post(
  "/verify-email",
  validate(verifyEmailSchema, "body"),
  asyncHandler(authController.verifyEmail)
);

router.post(
  "/resend-verification",
  validate(resendVerificationSchema, "body"),
  asyncHandler(authController.resendVerification)
);

router.post(
  "/forgot-password",
  validate(forgotPasswordSchema, "body"),
  asyncHandler(authController.forgotPassword)
);

export { router as authRouter };
