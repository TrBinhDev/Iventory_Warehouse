-- Ô tìm kiếm gộp cho GET /suppliers?search= và GET /warehouses?search=.
-- 8 index GIN trigram vì btree không dùng được cho ILIKE '%...%' (khớp giữa chuỗi).
--
-- Kèm backfill số điện thoại: 2 bảng này trước đây khai phone là z.string().max(20) nên lưu
-- được nhiều dạng cho cùng một số, mà tra bằng contains thì gõ đúng số vẫn không ra. Từ nay
-- schema dùng phoneSchema chuẩn hoá lúc ghi (giống User ở migration 20260817080214), phần
-- dưới dọn dữ liệu cũ.
--
-- LUẬT phải khớp hàm normalizePhone trong src/utils/phone.util.ts, sửa một bên thì sửa cả hai:
--   1. Bỏ mọi ký tự không phải chữ số
--   2. Đúng 11 chữ số và bắt đầu bằng 84 -> thay 84 bằng 0 (dạng +84 quốc tế)
--   3. Không còn chữ số nào -> NULL

-- CreateIndex
CREATE INDEX "Supplier_name_idx" ON "Supplier" USING GIN ("name" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "Supplier_code_idx" ON "Supplier" USING GIN ("code" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "Supplier_phone_idx" ON "Supplier" USING GIN ("phone" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "Supplier_contactName_idx" ON "Supplier" USING GIN ("contactName" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "Supplier_email_idx" ON "Supplier" USING GIN ("email" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "Warehouse_name_idx" ON "Warehouse" USING GIN ("name" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "Warehouse_code_idx" ON "Warehouse" USING GIN ("code" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "Warehouse_phone_idx" ON "Warehouse" USING GIN ("phone" gin_trgm_ops);

-- Backfill Supplier.phone
UPDATE "Supplier"
SET "phone" = CASE
    WHEN length(regexp_replace("phone", '[^0-9]', '', 'g')) = 11
     AND regexp_replace("phone", '[^0-9]', '', 'g') LIKE '84%'
      THEN '0' || substring(regexp_replace("phone", '[^0-9]', '', 'g') FROM 3)
    ELSE regexp_replace("phone", '[^0-9]', '', 'g')
  END
WHERE "phone" IS NOT NULL;

UPDATE "Supplier" SET "phone" = NULL WHERE "phone" = '';

-- Backfill Warehouse.phone
UPDATE "Warehouse"
SET "phone" = CASE
    WHEN length(regexp_replace("phone", '[^0-9]', '', 'g')) = 11
     AND regexp_replace("phone", '[^0-9]', '', 'g') LIKE '84%'
      THEN '0' || substring(regexp_replace("phone", '[^0-9]', '', 'g') FROM 3)
    ELSE regexp_replace("phone", '[^0-9]', '', 'g')
  END
WHERE "phone" IS NOT NULL;

UPDATE "Warehouse" SET "phone" = NULL WHERE "phone" = '';
