-- Sequence sinh số thứ tự cho mã phiếu Reservation, dùng ở tầng service để dựng
-- mã dạng RES-YYYYMMDD-000123 (mã dễ đọc cho khách/nhân viên, tách khỏi id UUID nội bộ).
--
-- Vì sao dùng SEQUENCE thay vì đếm row trong ngày rồi +1: nextval là atomic thật ở
-- tầng Postgres, không hở race khi nhiều khách cùng tạo phiếu. Cũng không dùng Redis
-- INCR vì mất Redis là counter về 0 → sinh mã trùng.
--
-- Đánh đổi đã chấp nhận: (1) số KHÔNG reset theo ngày, phiếu đầu ngày hôm sau nối tiếp
-- số hôm trước; (2) sequence không rollback theo transaction nên transaction fail vẫn
-- ăn mất một số, dãy có lỗ. Cả hai chỉ ảnh hưởng thẩm mỹ của mã hiển thị.
--
-- Prisma không mô hình hoá sequence độc lập (chỉ loại gắn với @default(autoincrement()))
-- nên không khai báo trong schema.prisma — cùng dạng với CHECK constraint đã thêm trước đây.
CREATE SEQUENCE IF NOT EXISTS reservation_code_seq
  AS BIGINT
  START WITH 1
  INCREMENT BY 1
  NO MAXVALUE
  NO CYCLE;
