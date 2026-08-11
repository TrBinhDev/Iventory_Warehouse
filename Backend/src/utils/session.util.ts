import type { UserRole } from "@prisma/client";
import { redis } from "../config/redis.js";
import { hashToken } from "./hash.util.js";
import {
  JWT_REFRESH_EXPIRES_IN_SECONDS,
  SESSION_KEY_PREFIX,
} from "../constants/jwt.js";

export interface SessionMeta {
  role: UserRole;
  warehouseId: string | null;
  userAgent?: string;
  ip?: string;
}

interface SessionRecord extends SessionMeta {
  tokenHash: string;
  createdAt: string;
}

function sessionKey(userId: string): string {
  return `${SESSION_KEY_PREFIX}${userId}`;
}

export async function createSession(
  userId: string,
  refreshToken: string,
  meta: SessionMeta
): Promise<void> {
  const record: SessionRecord = {
    tokenHash: hashToken(refreshToken),
    role: meta.role,
    warehouseId: meta.warehouseId,
    userAgent: meta.userAgent,
    ip: meta.ip,
    createdAt: new Date().toISOString(),
  };

  // SET ghi đè key cũ của cùng userId → tự động thực thi single-session
  // (login/refresh mới sẽ vô hiệu hoá session trước đó của chính user này).
  await redis.set(
    sessionKey(userId),
    JSON.stringify(record),
    "EX",
    JWT_REFRESH_EXPIRES_IN_SECONDS
  );
}

export async function validateSession(
  userId: string,
  refreshToken: string
): Promise<boolean> {
  const raw = await redis.get(sessionKey(userId));
  if (!raw) return false;

  const record = JSON.parse(raw) as SessionRecord;
  return record.tokenHash === hashToken(refreshToken);
}

// Rotation dùng chung logic với tạo mới: cùng là "ghi đè session hiện tại bằng token mới".
export const rotateSession = createSession;

export async function destroySession(userId: string): Promise<void> {
  await redis.del(sessionKey(userId));
}
