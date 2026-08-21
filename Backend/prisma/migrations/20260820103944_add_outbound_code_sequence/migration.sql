-- CreateIndex
CREATE INDEX "Outbound_code_idx" ON "Outbound" USING GIN ("code" gin_trgm_ops);

-- Sequence sinh số thứ tự cho mã phiếu xuất, dùng ở service để dựng mã OUT-YYYYMMDD-000123.
-- Cùng khuôn và cùng lý do với reservation_code_seq/sales_order_code_seq/inbound_code_seq.
CREATE SEQUENCE IF NOT EXISTS outbound_code_seq
  AS BIGINT
  START WITH 1
  INCREMENT BY 1
  NO MAXVALUE
  NO CYCLE;
