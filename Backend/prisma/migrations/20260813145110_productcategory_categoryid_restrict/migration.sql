-- ProductCategory.categoryId: CASCADE -> RESTRICT
--
-- Xoá loại sản phẩm là thao tác đụng vào dữ liệu của bản ghi KHÁC: để CASCADE thì xoá 1 loại
-- sẽ âm thầm gỡ phân loại của hàng chục sản phẩm, admin thấy 'xoá thành công' mà không biết
-- vừa làm gì. DELETE /categories/:id đã chặn ở service, đây là lớp đỡ phía dưới cho các
-- đường vòng (race, chạy SQL tay, code sau này quên đếm).
--
-- ProductCategory.productId GIỮ NGUYÊN CASCADE: dòng gán thuộc về chính sản phẩm nên xoá
-- sản phẩm thì gán mất theo. DELETE /products/:id dựa vào đó, đổi sang Restrict sẽ làm vỡ.
-- Sau migration này: 37 RESTRICT + 1 CASCADE (là cái duy nhất, có chủ ý).

-- DropForeignKey
ALTER TABLE "ProductCategory" DROP CONSTRAINT "ProductCategory_categoryId_fkey";

-- AddForeignKey
ALTER TABLE "ProductCategory" ADD CONSTRAINT "ProductCategory_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

