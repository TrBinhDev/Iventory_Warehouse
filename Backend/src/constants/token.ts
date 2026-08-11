// TTL + prefix Redis cho các token dùng 1 lần (không phải JWT): verify email, reset password

export const EMAIL_VERIFY_TOKEN_TTL_SECONDS = 24 * 60 * 60; // 24 giờ
export const RESET_PASSWORD_TOKEN_TTL_SECONDS = 15 * 60; // 15 phút

export const EMAIL_VERIFY_TOKEN_PREFIX = "verify-email:";
export const RESET_PASSWORD_TOKEN_PREFIX = "reset-password:";
