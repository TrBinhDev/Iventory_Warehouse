# Actor

Admin: Quản lý hệ thống
Warehouse Manager: Quản lý kho
Warehouse Staff: Nhân viên kho
Customer: Khách hàng

# Thiết kế Entity

## Authentication

User // Thông tin tài khoản người dùng (Admin, Warehouse Manager, Warehouse Staff, Customer).

## Master Data

Warehouse // Thông tin các kho hàng.

Supplier // Thông tin nhà cung cấp phục vụ nhập kho.

Category // Loại sản phẩm

Product // Thông tin chung của sản phẩm.

ProductCategory // Bảng trung gian, 1 Product thuộc nhiều Category và ngược lại.

SKU // Biến thể của Product (mã SKU, giá, thuộc tính...).

## Inventory

Inventory // Quản lý số lượng tồn kho của từng SKU tại từng Warehouse (quantityOnHand, quantityReserved, version). KHÔNG có cột available — luôn tính runtime bằng onHand - reserved, lưu sẵn là mở đường cho lệch số.

## Business

Reservation // Phiếu đặt trước hàng hóa của khách hàng.

ReservationItem // Danh sách SKU và số lượng được đặt trước trong một Reservation.

SalesOrder // Đơn mua hàng của khách hàng.

SalesOrderItem // Danh sách SKU và số lượng trong một Order.

Inbound // Phiếu nhập kho từ nhà cung cấp.

InboundItem // Danh sách SKU và số lượng trong một phiếu nhập.

Outbound // Phiếu xuất kho (giao hàng cho khách hoặc các nghiệp vụ xuất khác).

OutboundItem // Danh sách SKU và số lượng trong một phiếu xuất.

Transfer // Phiếu chuyển hàng giữa các kho.

TransferItem // Danh sách SKU và số lượng trong một lần chuyển kho.

InventoryAdjustment // Phiếu điều chỉnh tồn kho (Header).

InventoryAdjustmentItem // Danh sách SKU được điều chỉnh trong một phiếu điều chỉnh.

## Audit

InventoryMovement // Lưu lịch sử mọi biến động SỐ LƯỢNG tồn kho (Inbound, Outbound, Transfer, Reservation, Buy Now, Adjustment) phục vụ audit và truy vết.

## History

DocumentStatusHistory // Lưu lịch sử chuyển TRẠNG THÁI của cả 6 loại chứng từ nghiệp vụ — ai bấm bước nào, lúc nào. Polymorphic qua cặp (documentType, documentId), không phải FK.

> **Audit ≠ History, đừng gộp hai bảng.** `InventoryMovement` chỉ ghi ở bước có chạm tồn kho, nên mọi bước chuyển trạng thái không đụng kho (VD `Inbound: DRAFT → CONFIRMED`, `SalesOrder: PENDING → PAID`) là hoàn toàn vô hình với nó. Ngược lại `DocumentStatusHistory` không giữ số before/after từng SKU. Hai bảng bù nhau, không cái nào chứa cái nào — chi tiết ở `Business_DocumentStatusHistory.md`.
