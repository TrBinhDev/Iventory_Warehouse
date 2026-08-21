-- CreateIndex
CREATE INDEX "Transfer_code_idx" ON "Transfer" USING GIN ("code" gin_trgm_ops);

-- Sequence sinh số thứ tự cho mã phiếu chuyển kho, dùng ở service để dựng mã TRF-YYYYMMDD-000123.
-- Cùng khuôn và cùng lý do với reservation_code_seq/sales_order_code_seq/inbound_code_seq/outbound_code_seq.
CREATE SEQUENCE IF NOT EXISTS transfer_code_seq
  AS BIGINT
  START WITH 1
  INCREMENT BY 1
  NO MAXVALUE
  NO CYCLE;
