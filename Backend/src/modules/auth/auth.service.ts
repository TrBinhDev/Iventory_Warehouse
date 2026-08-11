import { randomInt } from "crypto";
import { redis } from "../../config/redis.js";
import { logger } from "../../config/logger.js";
import { hashPassword, comparePassword } from "../../utils/hash.util.js";
import { sendVerificationEmail } from "../../utils/mailer.util.js";
import { signAccessToken, signRefreshToken } from "../../utils/jwt.util.js";
import { createSession } from "../../utils/session.util.js";
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
} from "../../errors/appError.js";
import {
  EMAIL_VERIFY_OTP_LENGTH,
  EMAIL_VERIFY_OTP_MAX_ATTEMPTS,
  EMAIL_VERIFY_OTP_PREFIX,
  EMAIL_VERIFY_OTP_TTL_SECONDS,
} from "../../constants/token.js";
import * as authRepository from "./auth.repository.js";
import type {
  RegisterInput,
  LoginInput,
  VerifyEmailInput,
  ResendVerificationInput,
} from "./auth.schema.js";

interface EmailOtpRecord {
  otp: string;
  attempts: number;
  userId: string;
}

// Sinh mã OTP ngẫu nhiên (CSPRNG) đủ số chữ số cấu hình, đệm số 0 phía trước nếu thiếu
function generateOtp(length: number): string {
  const max = 10 ** length;
  return randomInt(0, max).toString().padStart(length, "0");
}

// Sinh OTP mới và lưu vào Redis (ghi đè OTP cũ nếu có), trả về mã để gửi email
async function issueEmailOtp(userId: string, email: string): Promise<string> {
  const otp = generateOtp(EMAIL_VERIFY_OTP_LENGTH);
  const record: EmailOtpRecord = { otp, attempts: 0, userId };

  await redis.set(
    `${EMAIL_VERIFY_OTP_PREFIX}${email}`,
    JSON.stringify(record),
    "EX",
    EMAIL_VERIFY_OTP_TTL_SECONDS
  );

  return otp;
}

// Đăng ký tài khoản Customer mới: tạo user, sinh OTP lưu Redis, gửi email chứa mã OTP
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

  const otp = await issueEmailOtp(user.id, user.email);

  try {
    await sendVerificationEmail(user.email, otp);
  } catch (err) {
    // Không rollback tài khoản nếu gửi mail lỗi — user có thể gọi lại /auth/resend-verification sau
    logger.error("Không gửi được email OTP lúc đăng ký", err);
  }

  return user;
}

// Xác thực email bằng OTP: so khớp với Redis, sai thì tăng attempt counter, quá giới hạn thì khoá tạm
export async function verifyEmail(input: VerifyEmailInput) {
  const key = `${EMAIL_VERIFY_OTP_PREFIX}${input.email}`;
  const raw = await redis.get(key);

  if (!raw) {
    throw new BadRequestError("Mã OTP không tồn tại hoặc đã hết hạn", "OTP_EXPIRED");
  }

  const record = JSON.parse(raw) as EmailOtpRecord;

  if (record.attempts >= EMAIL_VERIFY_OTP_MAX_ATTEMPTS) {
    await redis.del(key);
    throw new BadRequestError(
      "Đã nhập sai quá số lần cho phép, vui lòng gửi lại mã mới",
      "OTP_LOCKED"
    );
  }

  if (record.otp !== input.otp) {
    record.attempts += 1;
    await redis.set(key, JSON.stringify(record), "KEEPTTL");
    throw new BadRequestError("Mã OTP không đúng", "OTP_INVALID", {
      remainingAttempts: EMAIL_VERIFY_OTP_MAX_ATTEMPTS - record.attempts,
    });
  }

  await redis.del(key);
  return authRepository.markEmailVerified(record.userId);
}

// Gửi lại OTP xác thực email — sinh mã mới ghi đè, reset TTL + attempt counter
export async function resendVerification(input: ResendVerificationInput) {
  const user = await authRepository.findByEmailSafe(input.email);
  if (!user) {
    throw new NotFoundError("Không tìm thấy tài khoản với email này", "USER_NOT_FOUND");
  }

  if (user.isEmailVerified) {
    throw new ConflictError("Email đã được xác thực", "EMAIL_ALREADY_VERIFIED");
  }

  const otp = await issueEmailOtp(user.id, user.email);
  await sendVerificationEmail(user.email, otp);
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
