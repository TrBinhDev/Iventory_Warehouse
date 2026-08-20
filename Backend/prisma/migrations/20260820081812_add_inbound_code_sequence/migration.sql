-- CreateIndex
CREATE INDEX "Inbound_code_idx" ON "Inbound" USING GIN ("code" gin_trgm_ops);

-- Sequence sinh số thứ tự cho mã phiếu nhập, dùng ở service để dựng mã IN-YYYYMMDD-000123.
-- Cùng khuôn và cùng lý do với reservation_code_seq/sales_order_code_seq: nextval atomic thật
-- ở tầng Postgres, không hở race; số không reset theo ngày và không rollback theo transaction
-- nên dãy có lỗ — chỉ ảnh hưởng thẩm mỹ mã hiển thị.
--
-- Prisma không mô hình hoá sequence độc lập nên không khai trong schema.prisma; đã kiểm
-- migrate diff không coi là drift.
CREATE SEQUENCE IF NOT EXISTS inbound_code_seq
  AS BIGINT
  START WITH 1
  INCREMENT BY 1
  NO MAXVALUE
  NO CYCLE;
