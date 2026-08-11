export const JWT_ALGORITHM = "HS256" as const;

export const JWT_ACCESS_EXPIRES_IN = "15m";
export const JWT_REFRESH_EXPIRES_IN = "7d";

// Cùng thời hạn với JWT_REFRESH_EXPIRES_IN, quy đổi sẵn ra giây để dùng cho TTL Redis và maxAge cookie
export const JWT_REFRESH_EXPIRES_IN_SECONDS = 7 * 24 * 60 * 60;

export const REFRESH_TOKEN_COOKIE_NAME = "refreshToken";

// Redis key lưu session refresh token: `${SESSION_KEY_PREFIX}<userId>`
export const SESSION_KEY_PREFIX = "session:";
