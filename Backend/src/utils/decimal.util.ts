import { z } from "zod";

// Validate chuỗi số thập phân dùng cho field tiền tệ/Decimal (VD price, cost, unitPrice...) —
// nhận string thay vì number JS để Prisma parse chính xác tuyệt đối, tránh sai số floating point
export function decimalStringSchema(maxDecimalPlaces: number, message: string) {
  const pattern = new RegExp(`^\\d+(\\.\\d{1,${maxDecimalPlaces}})?$`);
  return z.string().regex(pattern, message);
}
