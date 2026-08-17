-- Trigram cho filter code= o GET /reservations va GET /sales-orders.
-- Hai filter do dung `contains` (khop giua chuoi) nen unique index btree san co cua cot code
-- KHONG dung duoc — Postgres phai quet toan bang. Day la 2 bang chung tu, se lon nhat he thong.

-- CreateIndex
CREATE INDEX "Reservation_code_idx" ON "Reservation" USING GIN ("code" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "SalesOrder_code_idx" ON "SalesOrder" USING GIN ("code" gin_trgm_ops);

