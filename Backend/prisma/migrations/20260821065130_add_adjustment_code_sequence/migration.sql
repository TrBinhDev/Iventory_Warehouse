-- CreateIndex
CREATE INDEX "InventoryAdjustment_code_idx" ON "InventoryAdjustment" USING GIN ("code" gin_trgm_ops);

-- Sequence sinh số thứ tự cho mã phiếu điều chỉnh, dùng ở service để dựng mã ADJ-YYYYMMDD-000123.
-- Cùng khuôn và cùng lý do với 4 sequence trước (reservation/sales_order/inbound/outbound/transfer).
CREATE SEQUENCE IF NOT EXISTS adjustment_code_seq
  AS BIGINT
  START WITH 1
  INCREMENT BY 1
  NO MAXVALUE
  NO CYCLE;
