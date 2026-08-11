export const ErrorCode = {
  VALIDATION_ERROR: "VALIDATION_ERROR",
  UNAUTHORIZED: "UNAUTHORIZED",
  TOKEN_INVALID: "TOKEN_INVALID",
  TOKEN_EXPIRED: "TOKEN_EXPIRED",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  CONFLICT: "CONFLICT",
  INTERNAL_ERROR: "INTERNAL_ERROR",
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export const ErrorMessage: Record<ErrorCode, string> = {
  VALIDATION_ERROR: "Dữ liệu gửi lên không hợp lệ",
  UNAUTHORIZED: "Bạn cần đăng nhập để thực hiện thao tác này",
  TOKEN_INVALID: "Token không hợp lệ",
  TOKEN_EXPIRED: "Token đã hết hạn",
  FORBIDDEN: "Bạn không có quyền thực hiện thao tác này",
  NOT_FOUND: "Không tìm thấy dữ liệu",
  CONFLICT: "Dữ liệu đã bị thay đổi hoặc xung đột",
  INTERNAL_ERROR: "Đã có lỗi xảy ra, vui lòng thử lại sau",
};
