// TTL + prefix Redis cho các token dùng 1 lần (không phải JWT): OTP verify email, link reset password

export const EMAIL_VERIFY_OTP_LENGTH = 6;
export const EMAIL_VERIFY_OTP_TTL_SECONDS = 10 * 60; // 10 phút
export const EMAIL_VERIFY_OTP_MAX_ATTEMPTS = 5;
export const EMAIL_VERIFY_OTP_PREFIX = "verify-email:";

export const RESET_PASSWORD_TOKEN_TTL_SECONDS = 15 * 60; // 15 phút
export const RESET_PASSWORD_TOKEN_PREFIX = "reset-password:";

// Idempotency-Key: key chỉ cần sống đủ lâu để phủ cửa sổ retry của client (double-click,
// client tự gửi lại khi response rớt). Client sinh UUID mới cho mỗi ý định nên key không
// bao giờ được tái sử dụng hợp lệ — không cần giữ hàng giờ.
export const IDEMPOTENCY_TTL_SECONDS = 60;
export const IDEMPOTENCY_KEY_PREFIX = "idem:";
