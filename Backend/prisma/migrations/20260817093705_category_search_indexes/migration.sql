-- O tim kiem gop cho GET /categories?search= (name, code).
-- btree khong dung duoc cho ILIKE %...% (khop giua chuoi) nen phai la GIN trigram.

-- CreateIndex
CREATE INDEX "Category_name_idx" ON "Category" USING GIN ("name" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "Category_code_idx" ON "Category" USING GIN ("code" gin_trgm_ops);

