# Phân tích Task: Inventory & Warehouse

## Mục tiêu

Xây dựng hệ thống quản lý kho hàng (Inventory & Warehouse) hỗ trợ:

- Quản lý nhiều kho (Warehouse).
- Quản lý hàng hóa (Product/SKU).
- Quản lý tồn kho (Inventory).
- Reservation (đặt trước hàng hóa).
- Buy Now (mua ngay).
- Nhập kho (Inbound).
- Xuất kho (Outbound).
- Chuyển kho (Transfer).
- Điều chỉnh tồn kho (Inventory Adjustment).

Hệ thống phải xử lý tốt các tình huống nhiều người cùng thao tác trên một SKU nhằm đảm bảo tính nhất quán dữ liệu.

---

## Các vấn đề cần giải quyết

- Race Condition khi nhiều người cùng thao tác trên một SKU.
- Tránh Overselling khi nhiều khách hàng cùng mua SKU cuối cùng.
- Tránh Over-Reservation khi nhiều khách hàng cùng đặt trước.
- Tránh tồn kho âm (Negative Inventory) do nhiều transaction cập nhật đồng thời.
- Đảm bảo dữ liệu luôn nhất quán khi transaction gặp lỗi.

---

## Các cơ chế sử dụng

### Transaction

Sử dụng Transaction để đảm bảo tính Atomicity (All or Nothing).

Nếu bất kỳ bước nào trong một nghiệp vụ thất bại thì toàn bộ transaction sẽ Rollback nhằm tránh dữ liệu bị cập nhật một phần.

### Pessimistic Locking

Áp dụng Row-Level Lock (SELECT ... FOR UPDATE) của PostgreSQL.

Được sử dụng cho các nghiệp vụ có khả năng xảy ra xung đột cao và ảnh hưởng trực tiếp đến số lượng tồn kho.

Mục tiêu:

- Ngăn nhiều transaction cùng cập nhật một Inventory.
- Tránh Race Condition.
- Tránh Overselling.
- Tránh Negative Inventory.

---

### Optimistic Locking

Áp dụng cho các nghiệp vụ có khả năng xung đột thấp.

Không khóa dữ liệu khi đọc.

Khi cập nhật sẽ kiểm tra version (hoặc updatedAt).

Nếu dữ liệu đã được transaction khác thay đổi thì cập nhật thất bại và yêu cầu người dùng tải lại dữ liệu.

Mục tiêu:

- Tránh Lost Update.
- Không cần giữ lock trong thời gian dài.

---

## Phạm vi áp dụng

### Pessimistic Locking + Transaction

- Reservation
- Buy Now (Order)
- Inbound
- Outbound
- Transfer

Các nghiệp vụ này đều thay đổi số lượng tồn kho và có thể được thực hiện đồng thời.

---

### Optimistic Locking + Transaction

- Inventory Adjustment

Đây là nghiệp vụ quản trị, tần suất xung đột thấp nhưng vẫn cần phát hiện Lost Update.

---

## Mapping Use Case

| Use Case             | Locking                   |
| -------------------- | ------------------------- |
| Reservation          | Pessimistic + Transaction |
| Buy Now (Order)      | Pessimistic + Transaction |
| Inbound              | Pessimistic + Transaction |
| Outbound             | Pessimistic + Transaction |
| Transfer             | Pessimistic + Transaction |
| Inventory Adjustment | Optimistic + Transaction  |
  
---

## Mục tiêu của từng Use Case

| Use Case             | Mục tiêu                                                                 |
| -------------------- | ------------------------------------------------------------------------ |
| Buy Now              | Tránh Overselling khi nhiều khách hàng cùng mua SKU cuối cùng            |
| Reservation          | Tránh Over-Reservation khi nhiều khách hàng cùng đặt trước               |
| Inbound              | Đảm bảo cập nhật chính xác tồn kho khi nhiều nhân viên cùng nhập một SKU |
| Outbound             | Tránh tồn kho âm khi nhiều nhân viên cùng xuất một SKU                   |
| Transfer             | Tránh tồn kho âm và đảm bảo tính nhất quán giữa kho nguồn và kho đích    |
| Inventory Adjustment | Tránh Lost Update bằng Optimistic Locking                                |

---

## Các cơ chế hỗ trợ 

- PostgreSQL Row-Level Lock (`SELECT ... FOR UPDATE`) để xử lý concurrency trong database.
- Transaction để đảm bảo Atomicity và Rollback khi xảy ra lỗi.
- Redis Distributed Lock (nếu triển khai nhiều instance) để khóa tài nguyên ở mức phân tán.
- Idempotency Key để xử lý duplicate request do retry hoặc người dùng gửi nhiều request giống nhau.
