import { randomBytes } from "crypto";
import { redis } from "../../config/redis.js";
import { logger } from "../../config/logger.js";
import { hashPassword } from "../../utils/hash.util.js";
import { sendVerificationEmail } from "../../utils/mailer.util.js";
import { ConflictError } from "../../errors/appError.js";
import {
  EMAIL_VERIFY_TOKEN_PREFIX,
  EMAIL_VERIFY_TOKEN_TTL_SECONDS,
} from "../../constants/token.js";
import * as authRepository from "./auth.repository.js";
import type { RegisterInput } from "./auth.schema.js";

// Đăng ký tài khoản Customer mới: tạo user, sinh token verify lưu Redis, gửi email xác thực
export async function register(input: RegisterInput) {
  const existing = await authRepository.findByEmailSafe(input.email);
  if (existing) {
    throw new ConflictError("Email đã được sử dụng", "EMAIL_ALREADY_EXISTS");
  }

  const passwordHash = await hashPassword(input.password);
  const user = await authRepository.createCustomer({
    email: input.email,
    passwordHash,
    fullName: input.fullName,
    phone: input.phone,
  });

  const token = randomBytes(32).toString("hex");
  await redis.set(
    `${EMAIL_VERIFY_TOKEN_PREFIX}${token}`,
    user.id,
    "EX",
    EMAIL_VERIFY_TOKEN_TTL_SECONDS
  );

  try {
    await sendVerificationEmail(user.email, token);
  } catch (err) {
    // Không rollback tài khoản nếu gửi mail lỗi — user có thể gọi lại /auth/resend-verification sau
    logger.error("Không gửi được email xác thực lúc đăng ký", err);
  }

  return user;
}
