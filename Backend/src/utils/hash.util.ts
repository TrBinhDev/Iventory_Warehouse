import bcrypt from "bcrypt";
import { createHmac } from "crypto";
import { env } from "../config/env.js";

const SALT_ROUNDS = 10;

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

export function comparePassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

// HMAC (không phải SHA256 thường) để refresh token thô không bao giờ nằm trong Redis,
// dùng SECRET_KEY làm key nên chỉ server mới tái tạo được hash để so khớp.
export function hashToken(token: string): string {
  return createHmac("sha256", env.SECRET_KEY).update(token).digest("hex");
}
