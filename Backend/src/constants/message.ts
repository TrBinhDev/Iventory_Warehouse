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
    EMAIL_NOT_VERIFIED: {
      code: "EMAIL_NOT_VERIFIED",
      message: "Email chưa được xác thực, vui lòng nhập mã OTP đã gửi tới email của bạn",
    },
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
    IN_USE: { code: "USER_IN_USE", message: "Không thể xoá tài khoản vì đang được sử dụng" },
    CANNOT_DELETE_SELF: {
      code: "CANNOT_DELETE_SELF",
      message: "Không thể tự xoá tài khoản của chính mình",
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
    IN_USE: { code: "WAREHOUSE_IN_USE", message: "Không thể xoá kho vì đang được sử dụng" },
  },

  SUPPLIER: {
    NOT_FOUND: { code: "SUPPLIER_NOT_FOUND", message: "Không tìm thấy nhà cung cấp" },
    CODE_ALREADY_EXISTS: {
      code: "SUPPLIER_CODE_ALREADY_EXISTS",
      message: "Mã nhà cung cấp đã tồn tại",
    },
    IN_USE: {
      code: "SUPPLIER_IN_USE",
      message: "Không thể xoá nhà cung cấp vì đang được sử dụng",
    },
  },

  CATEGORY: {
    NOT_FOUND: { code: "CATEGORY_NOT_FOUND", message: "Không tìm thấy loại sản phẩm" },
    CODE_ALREADY_EXISTS: {
      code: "CATEGORY_CODE_ALREADY_EXISTS",
      message: "Mã loại sản phẩm đã tồn tại",
    },
    IN_USE: {
      code: "CATEGORY_IN_USE",
      message: "Không thể xoá loại sản phẩm vì đang được sử dụng",
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
    IN_USE: { code: "PRODUCT_IN_USE", message: "Không thể xoá sản phẩm vì đang được sử dụng" },
    SKU_IN_USE: { code: "SKU_IN_USE", message: "Không thể xoá SKU vì đang được sử dụng" },
  },

  INVENTORY: {
    NOT_FOUND: { code: "INVENTORY_NOT_FOUND", message: "Không tìm thấy dòng tồn kho" },
    ALREADY_EXISTS: {
      code: "INVENTORY_ALREADY_EXISTS",
      message: "Kho này đã có dòng tồn kho cho SKU này",
    },
    WAREHOUSE_NOT_FOUND: { code: "WAREHOUSE_NOT_FOUND", message: "Không tìm thấy kho" },
    SKU_NOT_FOUND: { code: "SKU_NOT_FOUND", message: "Không tìm thấy SKU" },
    FORBIDDEN_WAREHOUSE: {
      code: "FORBIDDEN_WAREHOUSE",
      message: "Manager chỉ được thao tác trên kho mình quản lý",
    },
    IN_USE: {
      code: "INVENTORY_IN_USE",
      message: "Không thể xoá dòng tồn kho vì đã có lịch sử biến động",
    },
  },

  UPLOAD: {
    NO_FILE: { code: "NO_FILE", message: "Chưa chọn file nào để tải lên" },
    INVALID_FILE_TYPE: {
      code: "INVALID_FILE_TYPE",
      message: "Chỉ chấp nhận ảnh định dạng JPEG, PNG hoặc WEBP",
    },
    FILE_TOO_LARGE: { code: "FILE_TOO_LARGE", message: "Mỗi ảnh tối đa 5MB" },
    TOO_MANY_FILES: { code: "TOO_MANY_FILES", message: "Tối đa 10 ảnh mỗi lần tải lên" },
    TOTAL_TOO_LARGE: {
      code: "TOTAL_TOO_LARGE",
      message: "Tổng dung lượng mỗi lần tải lên tối đa 25MB",
    },
    UPLOAD_FAILED: { code: "UPLOAD_FAILED", message: "Tải ảnh lên thất bại, vui lòng thử lại" },
  },

  RESERVATION: {
    NOT_FOUND: { code: "RESERVATION_NOT_FOUND", message: "Không tìm thấy phiếu giữ chỗ" },
    OUT_OF_STOCK: {
      code: "OUT_OF_STOCK",
      message: "Một số sản phẩm không còn đủ hàng để giữ chỗ",
    },
    INVENTORY_NOT_FOUND: {
      code: "INVENTORY_NOT_FOUND",
      message: "Kho này chưa khai báo tồn cho một số SKU trong phiếu",
    },
    WAREHOUSE_NOT_FOUND: { code: "WAREHOUSE_NOT_FOUND", message: "Không tìm thấy kho" },
    SKU_NOT_FOUND: { code: "SKU_NOT_FOUND", message: "Không tìm thấy SKU" },
    SKU_INACTIVE: {
      code: "SKU_INACTIVE",
      message: "Sản phẩm đã ngừng kinh doanh, không thể giữ chỗ",
    },
    MISSING_IDEMPOTENCY_KEY: {
      code: "MISSING_IDEMPOTENCY_KEY",
      message: "Thiếu header Idempotency-Key",
    },
    DUPLICATE_REQUEST: {
      code: "DUPLICATE_REQUEST",
      message: "Yêu cầu này đã được xử lý, vui lòng xem lại danh sách phiếu giữ chỗ",
    },
    INVALID_STATUS: {
      code: "RESERVATION_INVALID_STATUS",
      message: "Phiếu không còn ở trạng thái chờ nên không thể thao tác",
    },
    FORBIDDEN_WAREHOUSE: {
      code: "FORBIDDEN_WAREHOUSE",
      message: "Chỉ được thao tác trên kho mình quản lý",
    },
    CANCEL_REASON_REQUIRED: {
      code: "CANCEL_REASON_REQUIRED",
      message: "Cần nhập lý do khi huỷ phiếu giữ chỗ của khách",
    },
  },

  // Mã dùng lại nguyên văn của RESERVATION khi ý nghĩa y hệt (OUT_OF_STOCK, SKU_NOT_FOUND...)
  // để frontend map một lần dùng chung; chỉ đổi message cho đúng ngữ cảnh đơn hàng.
  SALES_ORDER: {
    NOT_FOUND: { code: "SALES_ORDER_NOT_FOUND", message: "Không tìm thấy đơn hàng" },
    OUT_OF_STOCK: {
      code: "OUT_OF_STOCK",
      message: "Một số sản phẩm không còn đủ hàng để đặt mua",
    },
    INVENTORY_NOT_FOUND: {
      code: "INVENTORY_NOT_FOUND",
      message: "Kho này chưa khai báo tồn cho một số SKU trong đơn",
    },
    WAREHOUSE_NOT_FOUND: { code: "WAREHOUSE_NOT_FOUND", message: "Không tìm thấy kho" },
    SKU_NOT_FOUND: { code: "SKU_NOT_FOUND", message: "Không tìm thấy SKU" },
    SKU_INACTIVE: {
      code: "SKU_INACTIVE",
      message: "Sản phẩm đã ngừng kinh doanh, không thể đặt mua",
    },
    MISSING_IDEMPOTENCY_KEY: {
      code: "MISSING_IDEMPOTENCY_KEY",
      message: "Thiếu header Idempotency-Key",
    },
    DUPLICATE_REQUEST: {
      code: "DUPLICATE_REQUEST",
      message: "Yêu cầu này đã được xử lý, vui lòng xem lại danh sách đơn hàng",
    },
    INVALID_STATUS: {
      code: "SALES_ORDER_INVALID_STATUS",
      message: "Đơn hàng không ở trạng thái cho phép thao tác này",
    },
    FORBIDDEN_WAREHOUSE: {
      code: "FORBIDDEN_WAREHOUSE",
      message: "Chỉ được thao tác trên kho mình quản lý",
    },
    CANCEL_REASON_REQUIRED: {
      code: "CANCEL_REASON_REQUIRED",
      message: "Cần nhập lý do khi huỷ đơn hàng của khách",
    },

    // Luồng B — đặt mua từ phiếu giữ chỗ có sẵn
    RESERVATION_NOT_FOUND: {
      code: "RESERVATION_NOT_FOUND",
      message: "Không tìm thấy phiếu giữ chỗ",
    },
    RESERVATION_INVALID_STATUS: {
      code: "RESERVATION_INVALID_STATUS",
      message: "Phiếu giữ chỗ đã hết hạn hoặc đã bị huỷ, không thể đặt mua",
    },
    RESERVATION_ALREADY_CONVERTED: {
      code: "RESERVATION_ALREADY_CONVERTED",
      message: "Phiếu giữ chỗ này đã được chuyển thành đơn hàng",
    },
  },

  INBOUND: {
    NOT_FOUND: { code: "INBOUND_NOT_FOUND", message: "Không tìm thấy phiếu nhập kho" },
    WAREHOUSE_NOT_FOUND: { code: "WAREHOUSE_NOT_FOUND", message: "Không tìm thấy kho" },
    SUPPLIER_NOT_FOUND: { code: "SUPPLIER_NOT_FOUND", message: "Không tìm thấy nhà cung cấp" },
    SALES_ORDER_NOT_FOUND: { code: "SALES_ORDER_NOT_FOUND", message: "Không tìm thấy đơn hàng" },
    // Chỉ đơn đã giao hoàn thành mới được tạo phiếu trả hàng — đơn còn PENDING/CANCELLED... đều chặn
    SALES_ORDER_NOT_COMPLETED: {
      code: "SALES_ORDER_NOT_COMPLETED",
      message: "Chỉ đơn hàng đã giao hoàn thành mới được tạo phiếu trả hàng",
    },
    SKU_NOT_FOUND: { code: "SKU_NOT_FOUND", message: "Không tìm thấy SKU" },

    // reason FROM_SUPPLIER/CUSTOMER_RETURN kéo theo supplierId/salesOrderId bắt buộc theo điều kiện
    SUPPLIER_REQUIRED: {
      code: "SUPPLIER_REQUIRED",
      message: "Nhập từ nhà cung cấp phải chọn nhà cung cấp",
    },
    SUPPLIER_NOT_ALLOWED: {
      code: "SUPPLIER_NOT_ALLOWED",
      message: "Nhập từ trả hàng không được chọn nhà cung cấp",
    },
    SALES_ORDER_REQUIRED: {
      code: "SALES_ORDER_REQUIRED",
      message: "Nhập từ trả hàng phải chọn đơn hàng",
    },
    SALES_ORDER_NOT_ALLOWED: {
      code: "SALES_ORDER_NOT_ALLOWED",
      message: "Nhập từ nhà cung cấp không được chọn đơn hàng",
    },

    FORBIDDEN_WAREHOUSE: {
      code: "FORBIDDEN_WAREHOUSE",
      message: "Chỉ được thao tác trên kho mình quản lý",
    },
    INVALID_STATUS: {
      code: "INBOUND_INVALID_STATUS",
      message: "Phiếu nhập không ở trạng thái cho phép thao tác này",
    },
    // Bước receive bắt buộc gửi đủ mọi item trong phiếu, không suy luận ngầm số thiếu
    ITEMS_MISMATCH: {
      code: "ITEMS_MISMATCH",
      message: "Danh sách SKU gửi lên không khớp với danh sách trong phiếu",
    },
  },

  OUTBOUND: {
    NOT_FOUND: { code: "OUTBOUND_NOT_FOUND", message: "Không tìm thấy phiếu xuất kho" },
    WAREHOUSE_NOT_FOUND: { code: "WAREHOUSE_NOT_FOUND", message: "Không tìm thấy kho" },
    SUPPLIER_NOT_FOUND: { code: "SUPPLIER_NOT_FOUND", message: "Không tìm thấy nhà cung cấp" },
    SALES_ORDER_NOT_FOUND: { code: "SALES_ORDER_NOT_FOUND", message: "Không tìm thấy đơn hàng" },
    SKU_NOT_FOUND: { code: "SKU_NOT_FOUND", message: "Không tìm thấy SKU" },

    // reason quyết định salesOrderId/supplierId/items bắt buộc cái nào
    SALES_ORDER_REQUIRED: {
      code: "SALES_ORDER_REQUIRED",
      message: "Xuất theo đơn hàng phải chọn đơn hàng",
    },
    SUPPLIER_NOT_ALLOWED: {
      code: "SUPPLIER_NOT_ALLOWED",
      message: "Xuất theo đơn hàng không được chọn nhà cung cấp",
    },
    ITEMS_NOT_ALLOWED: {
      code: "ITEMS_NOT_ALLOWED",
      message: "Xuất theo đơn hàng tự lấy danh sách SKU từ đơn hàng, không nhận items",
    },
    SUPPLIER_REQUIRED: {
      code: "SUPPLIER_REQUIRED",
      message: "Trả hàng về nhà cung cấp phải chọn nhà cung cấp",
    },
    SALES_ORDER_NOT_ALLOWED: {
      code: "SALES_ORDER_NOT_ALLOWED",
      message: "Không được chọn đơn hàng cho lý do xuất kho này",
    },
    ITEMS_REQUIRED: {
      code: "ITEMS_REQUIRED",
      message: "Cần nhập danh sách SKU cho lý do xuất kho này",
    },
    NOTE_REQUIRED: {
      code: "NOTE_REQUIRED",
      message: "Cần nhập ghi chú lý do xuất kho",
    },

    // Chỉ đơn đã duyệt (CONFIRMED) mới được tạo phiếu xuất theo đơn hàng đó
    SALES_ORDER_NOT_CONFIRMED: {
      code: "SALES_ORDER_NOT_CONFIRMED",
      message: "Chỉ đơn hàng đã duyệt mới được tạo phiếu xuất kho",
    },
    // 1 SalesOrder chỉ ứng với 1 phiếu Outbound còn hiệu lực (chưa CANCELLED)
    SALES_ORDER_ALREADY_HAS_OUTBOUND: {
      code: "SALES_ORDER_ALREADY_HAS_OUTBOUND",
      message: "Đơn hàng này đã có phiếu xuất kho khác đang xử lý",
    },

    FORBIDDEN_WAREHOUSE: {
      code: "FORBIDDEN_WAREHOUSE",
      message: "Chỉ được thao tác trên kho mình quản lý",
    },
    INVALID_STATUS: {
      code: "OUTBOUND_INVALID_STATUS",
      message: "Phiếu xuất không ở trạng thái cho phép thao tác này",
    },
    OUT_OF_STOCK: {
      code: "OUT_OF_STOCK",
      message: "Tồn kho không đủ để xuất — dữ liệu có thể đã lệch, cần kiểm tra lại",
    },
  },

  TRANSFER: {
    NOT_FOUND: { code: "TRANSFER_NOT_FOUND", message: "Không tìm thấy phiếu chuyển kho" },
    WAREHOUSE_NOT_FOUND: { code: "WAREHOUSE_NOT_FOUND", message: "Không tìm thấy kho" },
    SKU_NOT_FOUND: { code: "SKU_NOT_FOUND", message: "Không tìm thấy SKU" },
    SAME_WAREHOUSE: {
      code: "SAME_WAREHOUSE",
      message: "Kho nguồn và kho đích phải khác nhau",
    },
    FORBIDDEN_WAREHOUSE: {
      code: "FORBIDDEN_WAREHOUSE",
      message: "Chỉ được thao tác trên kho mình quản lý",
    },
    INVALID_STATUS: {
      code: "TRANSFER_INVALID_STATUS",
      message: "Phiếu chuyển kho không ở trạng thái cho phép thao tác này",
    },
    // Không dùng reserved nên đây là chốt CÓ THẬT (khác OUT_OF_STOCK bên outbound — nhánh
    // lý thuyết không thể chạm tới vì có reserved bảo đảm trước)
    OUT_OF_STOCK: {
      code: "OUT_OF_STOCK",
      message: "Kho nguồn không còn đủ hàng để xuất",
    },
    // Bước receive bắt buộc gửi đủ mọi SKU trong phiếu, không suy luận ngầm số thiếu
    ITEMS_MISMATCH: {
      code: "ITEMS_MISMATCH",
      message: "Danh sách SKU gửi lên không khớp với danh sách trong phiếu",
    },
  },

  INVENTORY_ADJUSTMENT: {
    NOT_FOUND: { code: "ADJUSTMENT_NOT_FOUND", message: "Không tìm thấy phiếu điều chỉnh tồn kho" },
    WAREHOUSE_NOT_FOUND: { code: "WAREHOUSE_NOT_FOUND", message: "Không tìm thấy kho" },
    SKU_NOT_FOUND: { code: "SKU_NOT_FOUND", message: "Không tìm thấy SKU" },
    // Inventory chưa từng khai báo cho SKU này ở kho này — không có gì để kiểm kê
    INVENTORY_NOT_FOUND: {
      code: "INVENTORY_NOT_FOUND",
      message: "Kho này chưa khai báo tồn cho một số SKU",
    },
    // 2 dòng cùng SKU trong 1 phiếu là mâu thuẫn logic (set onHand thành 2 giá trị khác nhau)
    DUPLICATE_SKU: {
      code: "DUPLICATE_SKU",
      message: "Danh sách SKU bị trùng — mỗi SKU chỉ được xuất hiện 1 lần trong phiếu",
    },
    FORBIDDEN_WAREHOUSE: {
      code: "FORBIDDEN_WAREHOUSE",
      message: "Chỉ được thao tác trên kho mình quản lý",
    },
    INVALID_STATUS: {
      code: "ADJUSTMENT_INVALID_STATUS",
      message: "Phiếu điều chỉnh không ở trạng thái cho phép thao tác này",
    },
    // Khoá optimistic: dòng tồn đã bị thay đổi bởi giao dịch khác kể từ lúc mở phiếu kiểm kê
    VERSION_CONFLICT: {
      code: "VERSION_CONFLICT",
      message: "Tồn kho đã bị thay đổi kể từ lúc mở phiếu kiểm kê, vui lòng kiểm tra lại",
    },
    // reserved hiện tại (có thể đã tăng kể từ lúc mở phiếu) lớn hơn số vừa đếm được
    BELOW_RESERVED: {
      code: "ADJUSTMENT_BELOW_RESERVED",
      message: "Số lượng kiểm kê thấp hơn số đang bị giữ chỗ, không thể điều chỉnh",
    },
  },
} as const;
