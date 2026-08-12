// File này chứa toàn bộ message + code lỗi dùng trong app, namespace theo từng module để dễ soát/sửa.
// Mỗi entry là cặp { code, message } đi chung — code dùng cho response.error.code (JSend),
// message là nội dung tiếng Việt hiển thị cho client.

export const Message = {
  COMMON: {
    SERVER_ERROR: { code: "INTERNAL_ERROR", message: "Đã có lỗi xảy ra, vui lòng thử lại sau" },
    VALIDATION_ERROR: { code: "VALIDATION_ERROR", message: "Dữ liệu gửi lên không hợp lệ" },
    UNAUTHORIZED: { code: "UNAUTHORIZED", message: "Bạn cần đăng nhập để thực hiện thao tác này" },
    FORBIDDEN: { code: "FORBIDDEN", message: "Bạn không có quyền thực hiện thao tác này" },
    NOT_FOUND: { code: "NOT_FOUND", message: "Không tìm thấy dữ liệu" },
    CONFLICT: { code: "CONFLICT", message: "Dữ liệu đã bị thay đổi hoặc xung đột" },
    TOKEN_INVALID: { code: "TOKEN_INVALID", message: "Token không hợp lệ" },
    TOKEN_EXPIRED: { code: "TOKEN_EXPIRED", message: "Token đã hết hạn" },
  },

  AUTH: {
    EMAIL_ALREADY_EXISTS: { code: "EMAIL_ALREADY_EXISTS", message: "Email đã được sử dụng" },
    INVALID_CREDENTIALS: { code: "INVALID_CREDENTIALS", message: "Email hoặc mật khẩu không đúng" },
    ACCOUNT_BLOCKED: { code: "ACCOUNT_BLOCKED", message: "Tài khoản đã bị khoá" },
    ACCOUNT_INACTIVE: { code: "ACCOUNT_INACTIVE", message: "Tài khoản chưa được kích hoạt" },
    OTP_EXPIRED: { code: "OTP_EXPIRED", message: "Mã OTP không tồn tại hoặc đã hết hạn" },
    OTP_LOCKED: {
      code: "OTP_LOCKED",
      message: "Đã nhập sai quá số lần cho phép, vui lòng gửi lại mã mới",
    },
    OTP_INVALID: { code: "OTP_INVALID", message: "Mã OTP không đúng" },
    EMAIL_ALREADY_VERIFIED: { code: "EMAIL_ALREADY_VERIFIED", message: "Email đã được xác thực" },
    USER_NOT_FOUND: { code: "USER_NOT_FOUND", message: "Không tìm thấy tài khoản với email này" },
    SESSION_REVOKED: {
      code: "SESSION_REVOKED",
      message: "Phiên đăng nhập đã hết hiệu lực, vui lòng đăng nhập lại",
    },
    RESET_TOKEN_INVALID: {
      code: "RESET_TOKEN_INVALID",
      message: "Token không hợp lệ hoặc đã hết hạn",
    },
    INVALID_CURRENT_PASSWORD: {
      code: "INVALID_CURRENT_PASSWORD",
      message: "Mật khẩu hiện tại không đúng",
    },
  },

  USER: {
    NOT_FOUND: { code: "USER_NOT_FOUND", message: "Không tìm thấy tài khoản" },
    EMAIL_ALREADY_EXISTS: { code: "EMAIL_ALREADY_EXISTS", message: "Email đã được sử dụng" },
    FORBIDDEN_ROLE: {
      code: "FORBIDDEN_ROLE",
      message: "Manager chỉ được tạo tài khoản Warehouse Staff",
    },
    FORBIDDEN_WAREHOUSE: {
      code: "FORBIDDEN_WAREHOUSE",
      message: "Manager chỉ được tạo tài khoản cho đúng kho mình quản lý",
    },
    FORBIDDEN_FIELD: {
      code: "FORBIDDEN_FIELD",
      message: "Manager không được sửa role/warehouseId",
    },
    CANNOT_CHANGE_OWN_ROLE: {
      code: "CANNOT_CHANGE_OWN_ROLE",
      message: "Không thể tự đổi role của chính mình",
    },
    INVALID_ROLE_WAREHOUSE_COMBINATION: {
      code: "INVALID_ROLE_WAREHOUSE_COMBINATION",
      message:
        "warehouseId bắt buộc với Manager/Staff, không được có với Admin — cần gửi kèm warehouseId phù hợp khi đổi role",
    },
  },

  WAREHOUSE: {
    NOT_FOUND: { code: "WAREHOUSE_NOT_FOUND", message: "Không tìm thấy kho" },
    CODE_ALREADY_EXISTS: { code: "WAREHOUSE_CODE_ALREADY_EXISTS", message: "Mã kho đã tồn tại" },
  },

  SUPPLIER: {
    NOT_FOUND: { code: "SUPPLIER_NOT_FOUND", message: "Không tìm thấy nhà cung cấp" },
    CODE_ALREADY_EXISTS: {
      code: "SUPPLIER_CODE_ALREADY_EXISTS",
      message: "Mã nhà cung cấp đã tồn tại",
    },
  },

  CATEGORY: {
    NOT_FOUND: { code: "CATEGORY_NOT_FOUND", message: "Không tìm thấy loại sản phẩm" },
    CODE_ALREADY_EXISTS: {
      code: "CATEGORY_CODE_ALREADY_EXISTS",
      message: "Mã loại sản phẩm đã tồn tại",
    },
  },

  PRODUCT: {
    NOT_FOUND: { code: "PRODUCT_NOT_FOUND", message: "Không tìm thấy sản phẩm" },
    CODE_ALREADY_EXISTS: { code: "PRODUCT_CODE_ALREADY_EXISTS", message: "Mã sản phẩm đã tồn tại" },
    CATEGORY_NOT_FOUND: {
      code: "PRODUCT_CATEGORY_NOT_FOUND",
      message: "Một hoặc nhiều categoryId không tồn tại",
    },
    SKU_NOT_FOUND: { code: "SKU_NOT_FOUND", message: "Không tìm thấy SKU" },
    SKU_CODE_ALREADY_EXISTS: { code: "SKU_CODE_ALREADY_EXISTS", message: "Mã SKU đã tồn tại" },
    SKU_BARCODE_ALREADY_EXISTS: {
      code: "SKU_BARCODE_ALREADY_EXISTS",
      message: "Barcode đã tồn tại",
    },
  },
} as const;
