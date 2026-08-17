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

// Số chữ số tối thiểu để coi chuỗi người dùng gõ là "đang tra số điện thoại".
// 3 vì "090" (đầu số) là ca tra thật ngắn nhất, còn 4 số cuối là ca phổ biến nhất.
const MIN_PHONE_SEARCH_DIGITS = 3;

// Chuyển chuỗi tìm kiếm thành mảnh số điện thoại để so, hoặc null nếu không phải đang tra số.
//
// ĐÂY LÀ LÝ DO HÀM NÀY TỒN TẠI, đừng gọi thẳng normalizePhone cho việc tìm kiếm: gõ chữ mà
// trong đó lẫn một chữ số (email "s3s-staff", tên "Kho 1") thì normalizePhone trả về đúng
// chữ số đó, và `phone contains "3"` khớp MỌI số có chữ số 3 — kết quả tìm đầy bản ghi không
// liên quan. Đã dính thật ở cả 5 endpoint tìm kiếm trước khi tách hàm này ra.
export function phoneSearchTerm(raw: string): string | null {
  const digits = normalizePhone(raw);
  return digits.length >= MIN_PHONE_SEARCH_DIGITS ? digits : null;
}

// Schema dùng chung cho mọi field số điện thoại. max(20) đặt TRƯỚC transform nên chặn theo độ
// dài người dùng gõ; refine đặt SAU nên chuỗi rác ("khong phai so") lọc hết chữ số thành rỗng
// và bị bắt ở đây thay vì lọt xuống DB.
export const phoneSchema = z
  .string()
  .max(20, "Số điện thoại tối đa 20 ký tự")
  .transform(normalizePhone)
  .refine((value) => /^\d{8,15}$/.test(value), "Số điện thoại không hợp lệ");
