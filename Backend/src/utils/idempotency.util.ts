import { redis } from "../config/redis.js";
import { ConflictError } from "../errors/appError.js";
import {
  IDEMPOTENCY_KEY_PREFIX,
  IDEMPOTENCY_TTL_SECONDS,
} from "../constants/token.js";

// Gộp userId vào key để 2 người vô tình gửi trùng UUID không chặn nhau
function buildKey(userId: string, requestKey: string): string {
  return `${IDEMPOTENCY_KEY_PREFIX}${userId}:${requestKey}`;
}

// Giữ chỗ key trước khi xử lý — SET NX là atomic nên 2 request đến cùng lúc tuyệt đối
// vẫn chỉ 1 cái lọt (khác hẳn kiểu đọc-rồi-ghi vốn hở race).
// Trả về key đã dựng để caller nhả lại khi thất bại, không phải tự ghép chuỗi lần nữa.
export async function claimIdempotencyKey(
  userId: string,
  requestKey: string,
  message: { code: string; message: string }
): Promise<string> {
  const key = buildKey(userId, requestKey);

  const result = await redis.set(key, "1", "EX", IDEMPOTENCY_TTL_SECONDS, "NX");
  if (result !== "OK") {
    throw new ConflictError(message.message, message.code);
  }

  return key;
}

// Nhả key khi xử lý thất bại, để client thử lại được ngay bằng chính key đó.
// Không nhả thì lỗi nghiệp vụ (VD hết hàng) bị che mất: khách bấm lại chỉ nhận
// DUPLICATE_REQUEST cho tới khi key hết hạn, dù hàng đã có lại.
// Thành công thì KHÔNG gọi hàm này — key phải sống hết TTL để chặn request trùng.
export async function releaseIdempotencyKey(key: string): Promise<void> {
  await redis.del(key);
}
