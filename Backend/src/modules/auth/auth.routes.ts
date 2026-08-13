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
  resetPasswordSchema,
  changePasswordSchema,
  updateMeSchema,
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

// Không phân quyền theo role: mọi user đã đăng nhập đều tự sửa được hồ sơ của CHÍNH MÌNH.
// Không có :id trên đường dẫn nên không thể nhắm vào tài khoản người khác.
router.patch(
  "/me",
  authenticate,
  validate(updateMeSchema, "body"),
  asyncHandler(authController.updateMe)
);

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

router.post(
  "/reset-password",
  validate(resetPasswordSchema, "body"),
  asyncHandler(authController.resetPassword)
);

router.post(
  "/change-password",
  authenticate,
  validate(changePasswordSchema, "body"),
  asyncHandler(authController.changePassword)
);

export { router as authRouter };
