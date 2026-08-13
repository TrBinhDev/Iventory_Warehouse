-- Index phục vụ tìm kiếm theo chuỗi con (GET /products?search=, GET /inventories?search=).
--
-- Prisma sinh ra `ILIKE '%tu khoa%'` cho contains + mode:"insensitive". Dấu % ở ĐẦU chuỗi
-- khiến index B-tree vô dụng (không nhảy được tới vị trí bắt đầu) nên Postgres phải quét
-- tuần tự. pg_trgm băm chuỗi thành cụm 3 ký tự và index từng cụm, nhờ đó ILIKE '%x%'
-- mới dùng được index.
--
-- Chỉ đánh trên 3 cột thực sự đang được search ở service layer. Hai bảng bị ghi nhiều nhất
-- (Inventory, InventoryMovement) KHÔNG dính index này, nên chi phí ghi tăng thêm chỉ rơi vào
-- thao tác hiếm (tạo/sửa sản phẩm, tạo/sửa SKU).
--
-- Không cần sửa code ứng dụng: truy vấn giữ nguyên, Postgres tự chọn dùng index.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- GET /inventories?search= — tìm theo mã SKU
CREATE INDEX "SKU_skuCode_trgm_idx"
  ON "SKU" USING gin ("skuCode" gin_trgm_ops);

-- GET /inventories?search= và GET /products?search= — tìm theo tên sản phẩm
CREATE INDEX "Product_name_trgm_idx"
  ON "Product" USING gin ("name" gin_trgm_ops);

-- GET /products?search= — tìm theo mã sản phẩm
CREATE INDEX "Product_code_trgm_idx"
  ON "Product" USING gin ("code" gin_trgm_ops);
