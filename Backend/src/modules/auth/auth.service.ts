import { randomBytes } from "crypto";
import { redis } from "../../config/redis.js";
import { logger } from "../../config/logger.js";
import { hashPassword, comparePassword } from "../../utils/hash.util.js";
import { sendVerificationEmail } from "../../utils/mailer.util.js";
import { signAccessToken, signRefreshToken } from "../../utils/jwt.util.js";
import { createSession } from "../../utils/session.util.js";
import { ConflictError, ForbiddenError, UnauthorizedError } from "../../errors/appError.js";
import {
  EMAIL_VERIFY_TOKEN_PREFIX,
  EMAIL_VERIFY_TOKEN_TTL_SECONDS,
} from "../../constants/token.js";
import * as authRepository from "./auth.repository.js";
import type { RegisterInput, LoginInput } from "./auth.schema.js";

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

interface LoginMeta {
  userAgent?: string;
  ip?: string;
}

// Đăng nhập bằng email+password (dùng chung mọi role), tạo session Redis single-session
export async function login(input: LoginInput, meta: LoginMeta) {
  const user = await authRepository.findByEmailWithPassword(input.email);
  if (!user) {
    throw new UnauthorizedError("Email hoặc mật khẩu không đúng", "INVALID_CREDENTIALS");
  }

  if (user.status !== "ACTIVE") {
    const isBlocked = user.status === "BLOCKED";
    throw new ForbiddenError(
      isBlocked ? "Tài khoản đã bị khoá" : "Tài khoản chưa được kích hoạt",
      isBlocked ? "ACCOUNT_BLOCKED" : "ACCOUNT_INACTIVE"
    );
  }

  const isPasswordMatch = await comparePassword(input.password, user.passwordHash);
  if (!isPasswordMatch) {
    throw new UnauthorizedError("Email hoặc mật khẩu không đúng", "INVALID_CREDENTIALS");
  }

  const accessToken = signAccessToken({
    sub: user.id,
    role: user.role,
    warehouseId: user.warehouseId,
  });
  const refreshToken = signRefreshToken({ sub: user.id });

  await createSession(user.id, refreshToken, {
    role: user.role,
    warehouseId: user.warehouseId,
    userAgent: meta.userAgent,
    ip: meta.ip,
  });

  const updatedUser = await authRepository.updateLastLogin(user.id);

  return { accessToken, refreshToken, user: updatedUser };
}
