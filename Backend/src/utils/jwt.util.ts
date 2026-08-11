import jwt from "jsonwebtoken";
import { randomUUID } from "crypto";
import type { UserRole } from "@prisma/client";
import { env } from "../config/env.js";
import {
  JWT_ACCESS_EXPIRES_IN,
  JWT_ALGORITHM,
  JWT_REFRESH_EXPIRES_IN,
} from "../constants/jwt.js";

export interface AccessTokenPayload {
  sub: string;
  role: UserRole;
  warehouseId: string | null;
}

export interface RefreshTokenPayload {
  sub: string;
}

export function signAccessToken(payload: AccessTokenPayload): string {
  // jti đảm bảo mỗi lần sign luôn ra token khác nhau, kể cả cấp 2 token trong cùng 1 giây
  return jwt.sign(
    { ...payload, jti: randomUUID() },
    env.JWT_ACCESS_SECRET,
    { algorithm: JWT_ALGORITHM, expiresIn: JWT_ACCESS_EXPIRES_IN }
  );
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, env.JWT_ACCESS_SECRET, {
    algorithms: [JWT_ALGORITHM],
  }) as AccessTokenPayload;
}

export function signRefreshToken(payload: RefreshTokenPayload): string {
  // jti đảm bảo mỗi lần rotate luôn ra refresh token khác nhau, kể cả trong cùng 1 giây
  return jwt.sign(
    { ...payload, jti: randomUUID() },
    env.JWT_REFRESH_SECRET,
    { algorithm: JWT_ALGORITHM, expiresIn: JWT_REFRESH_EXPIRES_IN }
  );
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  return jwt.verify(token, env.JWT_REFRESH_SECRET, {
    algorithms: [JWT_ALGORITHM],
  }) as RefreshTokenPayload;
}
