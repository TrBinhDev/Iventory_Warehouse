import { randomBytes, randomInt } from "crypto";
import jwt from "jsonwebtoken";
import { redis } from "../../config/redis.js";
import { logger } from "../../config/logger.js";
import { hashPassword, comparePassword } from "../../utils/hash.util.js";
import { sendVerificationEmail, sendPasswordResetEmail } from "../../utils/mailer.util.js";
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from "../../utils/jwt.util.js";
import {
  createSession,
  destroySession,
  rotateSession,
  validateSession,
} from "../../utils/session.util.js";
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
} from "../../errors/appError.js";
import { Message } from "../../constants/message.js";
import {
  EMAIL_VERIFY_OTP_LENGTH,
  EMAIL_VERIFY_OTP_MAX_ATTEMPTS,
  EMAIL_VERIFY_OTP_PREFIX,
  EMAIL_VERIFY_OTP_TTL_SECONDS,
  RESET_PASSWORD_TOKEN_PREFIX,
  RESET_PASSWORD_TOKEN_TTL_SECONDS,
} from "../../constants/token.js";
import * as authRepository from "./auth.repository.js";
import type {
  RegisterInput,
  LoginInput,
  VerifyEmailInput,
  ResendVerificationInput,
  UpdateMeInput,
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
    throw new ConflictError(Message.AUTH.EMAIL_ALREADY_EXISTS.message, Message.AUTH.EMAIL_ALREADY_EXISTS.code);
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
    throw new BadRequestError(Message.AUTH.OTP_EXPIRED.message, Message.AUTH.OTP_EXPIRED.code);
  }

  const record = JSON.parse(raw) as EmailOtpRecord;

  if (record.attempts >= EMAIL_VERIFY_OTP_MAX_ATTEMPTS) {
    await redis.del(key);
    throw new BadRequestError(Message.AUTH.OTP_LOCKED.message, Message.AUTH.OTP_LOCKED.code);
  }

  if (record.otp !== input.otp) {
    record.attempts += 1;
    await redis.set(key, JSON.stringify(record), "KEEPTTL");
    throw new BadRequestError(Message.AUTH.OTP_INVALID.message, Message.AUTH.OTP_INVALID.code, {
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
    throw new NotFoundError(Message.AUTH.USER_NOT_FOUND.message, Message.AUTH.USER_NOT_FOUND.code);
  }

  if (user.isEmailVerified) {
    throw new ConflictError(Message.AUTH.EMAIL_ALREADY_VERIFIED.message, Message.AUTH.EMAIL_ALREADY_VERIFIED.code);
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
    throw new UnauthorizedError(Message.AUTH.INVALID_CREDENTIALS.message, Message.AUTH.INVALID_CREDENTIALS.code);
  }

  if (user.status !== "ACTIVE") {
    const info = user.status === "BLOCKED" ? Message.AUTH.ACCOUNT_BLOCKED : Message.AUTH.ACCOUNT_INACTIVE;
    throw new ForbiddenError(info.message, info.code);
  }

  const isPasswordMatch = await comparePassword(input.password, user.passwordHash);
  if (!isPasswordMatch) {
    throw new UnauthorizedError(Message.AUTH.INVALID_CREDENTIALS.message, Message.AUTH.INVALID_CREDENTIALS.code);
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

// Cấp access+refresh token mới từ refresh token hợp lệ, rotate session (refresh token cũ hết hiệu lực ngay)
export async function refresh(refreshToken: string | undefined, meta: LoginMeta) {
  if (!refreshToken) {
    throw new UnauthorizedError(Message.COMMON.UNAUTHORIZED.message, Message.COMMON.UNAUTHORIZED.code);
  }

  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      throw new UnauthorizedError(Message.COMMON.TOKEN_EXPIRED.message, Message.COMMON.TOKEN_EXPIRED.code);
    }
    throw new UnauthorizedError(Message.COMMON.TOKEN_INVALID.message, Message.COMMON.TOKEN_INVALID.code);
  }

  const user = await authRepository.findByIdSafe(payload.sub);
  if (!user) {
    throw new UnauthorizedError(Message.COMMON.TOKEN_INVALID.message, Message.COMMON.TOKEN_INVALID.code);
  }

  if (user.status !== "ACTIVE") {
    const info = user.status === "BLOCKED" ? Message.AUTH.ACCOUNT_BLOCKED : Message.AUTH.ACCOUNT_INACTIVE;
    throw new ForbiddenError(info.message, info.code);
  }

  const isSessionValid = await validateSession(user.id, refreshToken);
  if (!isSessionValid) {
    // Refresh token hợp lệ theo JWT nhưng session đã bị rotate/logout/xoá — bắt đăng nhập lại
    throw new UnauthorizedError(Message.AUTH.SESSION_REVOKED.message, Message.AUTH.SESSION_REVOKED.code);
  }

  const newAccessToken = signAccessToken({
    sub: user.id,
    role: user.role,
    warehouseId: user.warehouseId,
  });
  const newRefreshToken = signRefreshToken({ sub: user.id });

  await rotateSession(user.id, newRefreshToken, {
    role: user.role,
    warehouseId: user.warehouseId,
    userAgent: meta.userAgent,
    ip: meta.ip,
  });

  return { accessToken: newAccessToken, refreshToken: newRefreshToken, user };
}

// Đăng xuất: xoá session Redis của user hiện tại (access token đã xác thực là đủ, không cần refresh token)
export async function logout(userId: string): Promise<void> {
  await destroySession(userId);
}

// Lấy thông tin tài khoản hiện tại từ id trong access token
export async function getMe(userId: string) {
  const user = await authRepository.findByIdSafe(userId);
  if (!user) {
    throw new UnauthorizedError(Message.COMMON.TOKEN_INVALID.message, Message.COMMON.TOKEN_INVALID.code);
  }
  return user;
}

// Tự sửa hồ sơ cá nhân — mọi role đều dùng được, luôn tác động lên chính mình
// (userId lấy từ access token, không nhận id từ client nên không sửa nhầm/cố ý sang người khác)
export async function updateMe(userId: string, input: UpdateMeInput) {
  const user = await authRepository.findByIdSafe(userId);
  if (!user) {
    throw new UnauthorizedError(Message.COMMON.TOKEN_INVALID.message, Message.COMMON.TOKEN_INVALID.code);
  }

  return authRepository.updateProfile(userId, {
    fullName: input.fullName,
    phone: input.phone,
    avatarUrl: input.avatarUrl,
  });
}

// Yêu cầu đặt lại mật khẩu: sinh token + gửi email nếu email tồn tại, im lặng bỏ qua nếu không
// (controller luôn trả response generic giống nhau để chống dò email tồn tại)
export async function forgotPassword(email: string): Promise<void> {
  const user = await authRepository.findByEmailSafe(email);
  if (!user) {
    return;
  }

  const token = randomBytes(32).toString("hex");
  await redis.set(
    `${RESET_PASSWORD_TOKEN_PREFIX}${token}`,
    user.id,
    "EX",
    RESET_PASSWORD_TOKEN_TTL_SECONDS
  );

  try {
    await sendPasswordResetEmail(user.email, token);
  } catch (err) {
    logger.error("Không gửi được email đặt lại mật khẩu", err);
  }
}

// Đặt lại mật khẩu bằng token (dùng 1 lần), destroy session hiện tại để bắt đăng nhập lại
export async function resetPassword(token: string, newPassword: string): Promise<void> {
  const key = `${RESET_PASSWORD_TOKEN_PREFIX}${token}`;
  const userId = await redis.get(key);

  if (!userId) {
    throw new BadRequestError(Message.AUTH.RESET_TOKEN_INVALID.message, Message.AUTH.RESET_TOKEN_INVALID.code);
  }

  const passwordHash = await hashPassword(newPassword);
  await authRepository.updatePassword(userId, passwordHash);
  await redis.del(key);
  await destroySession(userId);
}

// Đổi mật khẩu khi đã đăng nhập: verify mật khẩu hiện tại, destroy session để bắt đăng nhập lại
export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string
): Promise<void> {
  const user = await authRepository.findByIdWithPassword(userId);
  if (!user) {
    throw new UnauthorizedError(Message.COMMON.TOKEN_INVALID.message, Message.COMMON.TOKEN_INVALID.code);
  }

  const isMatch = await comparePassword(currentPassword, user.passwordHash);
  if (!isMatch) {
    throw new BadRequestError(Message.AUTH.INVALID_CURRENT_PASSWORD.message, Message.AUTH.INVALID_CURRENT_PASSWORD.code);
  }

  const passwordHash = await hashPassword(newPassword);
  await authRepository.updatePassword(userId, passwordHash);
  await destroySession(userId);
}
