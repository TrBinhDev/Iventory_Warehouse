-- Migration DỮ LIỆU, không đổi cấu trúc bảng: đưa User.phone đang lưu lộn xộn về cùng một
-- dạng với hàm normalizePhone trong src/utils/phone.util.ts.
--
-- Vì sao cần: phone trước đây khai là z.string().max(20) nên cùng một số máy lưu được dưới
-- nhiều dạng ("0901234567", "090 123 4567", "+84901234567", "0901-234-567"). Tra cứu bằng
-- ILIKE '%...%' (GET /sales-orders?customer=) thì gõ đúng số vẫn không ra — đã đo, 5 cách lưu
-- × 6 cách gõ chỉ khớp 11/30. Từ nay schema chuẩn hoá lúc ghi, migration này dọn dữ liệu cũ.
--
-- LUẬT phải khớp với hàm JS, sửa một bên thì sửa cả hai:
--   1. Bỏ mọi ký tự không phải chữ số
--   2. Đúng 11 chữ số và bắt đầu bằng 84 -> thay 84 bằng 0 (dạng +84 quốc tế)
--   3. Không còn chữ số nào -> NULL (dữ liệu rác kiểu "khong phai so")

UPDATE "User"
SET "phone" = CASE
    WHEN length(regexp_replace("phone", '[^0-9]', '', 'g')) = 11
     AND regexp_replace("phone", '[^0-9]', '', 'g') LIKE '84%'
      THEN '0' || substring(regexp_replace("phone", '[^0-9]', '', 'g') FROM 3)
    ELSE regexp_replace("phone", '[^0-9]', '', 'g')
  END
WHERE "phone" IS NOT NULL;

-- Chuỗi rỗng sau khi lọc nghĩa là giá trị cũ không chứa chữ số nào — để NULL chứ không giữ ''
UPDATE "User" SET "phone" = NULL WHERE "phone" = '';
