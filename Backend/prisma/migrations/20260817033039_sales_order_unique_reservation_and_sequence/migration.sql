-- 1 phiếu giữ chỗ chỉ đẻ ra được 1 đơn hàng. Index thường bị thay bằng unique index chứ
-- không mất khả năng tra cứu — unique index dùng để tìm kiếm y hệt.
--
-- Postgres coi mỗi NULL là khác nhau nên nhiều đơn "mua thẳng" (reservationId NULL) vẫn nằm
-- chung được. Ràng buộc này KHÔNG bịt race nào: luồng B chạy
-- UPDATE Reservation ... WHERE status = 'PENDING' trước, câu đó tự khoá dòng phiếu nên 2
-- request bị xếp hàng. Nó ở đây để chặn code viết sai trong tương lai quên mất luật.

-- DropIndex
DROP INDEX "SalesOrder_reservationId_idx";

-- CreateIndex
CREATE UNIQUE INDEX "SalesOrder_reservationId_key" ON "SalesOrder"("reservationId");

-- Sequence sinh số thứ tự cho mã đơn hàng, dùng ở service để dựng mã SO-YYYYMMDD-000123.
-- Cùng khuôn và cùng lý do với reservation_code_seq (xem 20260814104305): nextval atomic
-- thật ở tầng Postgres, không hở race; số không reset theo ngày và không rollback theo
-- transaction nên dãy có lỗ — chỉ ảnh hưởng thẩm mỹ mã hiển thị.
--
-- Prisma không mô hình hoá sequence độc lập nên không khai trong schema.prisma; đã kiểm
-- migrate diff không coi là drift.
CREATE SEQUENCE IF NOT EXISTS sales_order_code_seq
  AS BIGINT
  START WITH 1
  INCREMENT BY 1
  NO MAXVALUE
  NO CYCLE;
