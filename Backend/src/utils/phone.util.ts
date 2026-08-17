import { z } from "zod";

// Đưa số điện thoại về một dạng duy nhất: chỉ chữ số, đầu số VN dạng 0xxxxxxxxx.
//
// ĐÂY LÀ LÝ DO FILE NÀY TỒN TẠI: trước đây phone khai là z.string().max(20) nên cùng một số
// máy lưu được dưới nhiều dạng ("0901234567", "090 123 4567", "+84901234567", "0901-234-567"),
// và tra cứu bằng `contains` thì gõ đúng số vẫn không ra. Đã đo: 5 cách lưu × 6 cách gõ chỉ
// khớp 11/30 ô. Chuẩn hoá lúc GHI là chỗ sửa tận gốc — chuẩn hoá lúc tìm không cứu được dữ
// liệu đã lưu lệch nhau.
export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");

  // +84901234567 / 84 901 234 567 -> 0901234567. Chỉ đổi khi đúng 11 chữ số và bắt đầu bằng
  // 84, để không đụng nhầm số nước ngoài tình cờ có 84 ở đầu.
  if (digits.length === 11 && digits.startsWith("84")) {
    return `0${digits.slice(2)}`;
  }

  return digits;
}

// Schema dùng chung cho mọi field số điện thoại. max(20) đặt TRƯỚC transform nên chặn theo độ
// dài người dùng gõ; refine đặt SAU nên chuỗi rác ("khong phai so") lọc hết chữ số thành rỗng
// và bị bắt ở đây thay vì lọt xuống DB.
export const phoneSchema = z
  .string()
  .max(20, "Số điện thoại tối đa 20 ký tự")
  .transform(normalizePhone)
  .refine((value) => /^\d{8,15}$/.test(value), "Số điện thoại không hợp lệ");
