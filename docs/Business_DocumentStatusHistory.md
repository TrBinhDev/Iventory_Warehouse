## History — DocumentStatusHistory

Nhật ký **chuyển trạng thái chứng từ**, dùng chung cho cả 6 module nghiệp vụ. Trả lời câu hỏi *"ai bấm bước nào, lúc nào"* — thứ mà `InventoryMovement` không trả lời được vì nó chỉ ghi ở bước có chạm tồn kho.

```prisma
enum DocumentType {
  RESERVATION
  SALES_ORDER
  INBOUND
  OUTBOUND
  TRANSFER
  INVENTORY_ADJUSTMENT
}

model DocumentStatusHistory {
  id              String        @id @default(uuid()) @db.Uuid

  documentType    DocumentType

  documentId      String        @db.Uuid     // polymorphic, KHÔNG phải FK

  fromStatus      String?       @db.VarChar(30)   // null = nhập từ ngoài, không biết trạng thái trước
  toStatus        String        @db.VarChar(30)

  changedByUserId String?       @db.Uuid     // null = hệ thống tự chuyển
  changedBy       User?         @relation(fields: [changedByUserId], references: [id], onDelete: Restrict)

  note            String?

  createdAt       DateTime      @default(now())

  @@index([documentType, documentId, createdAt])
  @@index([changedByUserId])
}
```

## Relationship

```text
User (1) ─────────────< DocumentStatusHistory (N)   // changedBy, nullable, Restrict

Reservation         (1) ····< DocumentStatusHistory (N)   // KHÔNG phải FK,
SalesOrder          (1) ····< DocumentStatusHistory (N)   // nối bằng cặp
Inbound             (1) ····< DocumentStatusHistory (N)   // (documentType, documentId)
Outbound            (1) ····< DocumentStatusHistory (N)
Transfer            (1) ····< DocumentStatusHistory (N)
InventoryAdjustment (1) ····< DocumentStatusHistory (N)
```

## Vì sao có bảng này

Không bảng nghiệp vụ nào ghi **ai đóng/huỷ chứng từ**. `Inbound`/`Outbound`/`Transfer`/`InventoryAdjustment` đều có `createdByUserId`, `Reservation`/`SalesOrder` có `customerId` đóng vai trò đó — tức **người tạo thì có, người thực hiện các bước sau thì không**. Trong khi cả 6 đều có nhiều bước và bảng phân quyền cho phép nhiều role khác nhau thao tác.

Hai hướng đã cân nhắc:

| | Cột `<action>ByUserId` trên từng bảng | Bảng dùng chung (đã chọn) |
|---|---|---|
| Số cột thêm | ~18 cột rải khắp 5 module | 0 |
| Giữ đủ lịch sử nhiều bước | ✅ | ✅ |
| Thêm bước mới sau này | Phải migrate thêm cột | Không đụng schema |
| Số chỗ phải nhớ `countReferences` | 18 | 1 |

**Lý do quyết định là điểm cuối: 18 chỗ phải nhớ so với 1.** Mỗi cột FK mới là một chỗ có thể quên cập nhật `user.repository.countReferences`, và đã suýt quên đúng chỗ đó ở `reservation`.

**Đính chính một lập luận sai từng dùng:** hướng cột riêng **không** "mất lịch sử" — mỗi bước một cột thì vẫn giữ đủ người của từng bước. Cái nó thua là schema churn và số chỗ phải nhớ, không phải mất dữ liệu.

Đã loại hướng "1 cột `updatedByUserId` chung": nó chỉ giữ **người sửa gần nhất**, nên phiếu nhập do A duyệt rồi B nhận hàng sẽ mất dấu A — trong khi `confirmedAt` vẫn còn, thành ra biết *lúc nào* mà không biết *ai*. Nửa vời hơn là không có.

## Phân biệt: audit ≠ history — ĐỪNG GỘP HAI BẢNG

| | `InventoryMovement` (audit) | `DocumentStatusHistory` (history) |
|---|---|---|
| Ghi cái gì | Biến động **số lượng** tồn | Chuyển **trạng thái** chứng từ |
| Khi nào ghi | Chỉ khi `onHand`/`reserved` đổi | Mọi lần đổi status, kể cả không đụng kho |
| Số dòng mỗi lần | N (mỗi SKU 1 dòng) | 1 (dữ kiện cấp header) |
| Giữ riêng thứ gì | Số before/after từng SKU | Bước chuyển không đụng kho |

Ví dụ phiếu nhập 3 SKU:

```
DRAFT → CONFIRMED      1 history, 0 movement    (duyệt phiếu, chưa đụng kho)
CONFIRMED → RECEIVED   1 history, 3 movement    (nhận hàng thật)
```

Bước duyệt **hoàn toàn vô hình** với `InventoryMovement`. Ngược lại movement giữ thứ history không có: số trước/sau của từng SKU. **Hai bảng bù nhau, không cái nào chứa cái nào.**

Với `SalesOrder` thì rõ hơn nữa: đơn có 4 bước người bấm (`PAID`, `CONFIRMED`, `COMPLETED`, huỷ/hoàn) mà **3 trong 4 bước không chạm tồn kho**.

## Note — các điểm quan trọng

1. **`documentId` KHÔNG phải FK thật** — polymorphic, cùng khuôn `InventoryMovement.referenceId`. Đánh đổi đã chấp nhận: mất ràng buộc toàn vẹn ở tầng DB (không ngăn được dòng trỏ tới chứng từ không tồn tại, xoá chứng từ không kéo history theo), đổi lấy **1 bảng thay vì 6**.

   Hiện chưa module nào có API xoá chứng từ nên chưa thành vấn đề. **Khi nào có mới phải quyết** dọn history hay giữ lại.

2. **`fromStatus`/`toStatus` là `String` chứ không phải enum** — 6 module có 6 enum trạng thái khác nhau, không gộp được thành một kiểu.

   Cái giá là **gõ gì cũng lọt ở tầng DB**. Bù lại bằng type map trong `utils/status.core.ts`:

   ```ts
   interface StatusByDocument {
     RESERVATION: ReservationStatus;
     SALES_ORDER: SalesOrderStatus;
     INBOUND: InboundStatus;
     ...
   }
   ```

   Nhờ đó `documentType: "SALES_ORDER"` + `toStatus: "EXPIRED"` (trạng thái có thật nhưng của `Reservation`) bị **tsc chặn ngay**. Đã kiểm bằng 4 ca âm bản: gõ sai tên, dùng trạng thái module khác ở cả `toStatus` lẫn `fromStatus`, và `toStatus: null`.

3. **`DocumentType` trùng giá trị với `ReferenceType` nhưng CỐ Ý tách riêng.** Hai enum trả lời hai câu hỏi khác nhau: `ReferenceType` là *"chứng từ nào làm tồn kho biến động"*, `DocumentType` là *"chứng từ nào có trạng thái"*.

   Nói thẳng: **hôm nay đây là trùng lặp thật**. Giá trị nằm ở chỗ nếu sau này có movement không gắn chứng từ nào (chỉnh tay), hoặc có loại chứng từ có trạng thái nhưng không đụng kho, thì hai danh sách sẽ lệch — lúc đó dùng chung một enum là thêm giá trị cho bên này lại lòi ra ở bên kia.

4. **LUẬT: KHÔNG ghi dòng nào lúc TẠO chứng từ.** Bảng này là nhật ký **chuyển** trạng thái, mà lúc tạo thì chưa chuyển gì cả.

   Ba lý do:
   - Ai tạo + lúc nào **đã có sẵn** trên chính bảng chứng từ (`customerId`/`createdByUserId` + `createdAt`). Chép lại thành dòng `null → PENDING` chỉ tạo **2 nguồn cho cùng một dữ kiện**, mà 2 nguồn thì sớm muộn lệch nhau.
   - Tốn thêm 1 `INSERT` ngay **trong transaction đang giữ lock `FOR UPDATE`** trên `Inventory` — trả giá đúng chỗ đắt nhất, trên API bị gọi nhiều nhất.
   - Bảng sinh ra để biết **ai bấm bước nào**, mà bước tạo thì luôn chỉ một người.

   Đánh đổi đã chấp nhận: frontend vẽ timeline phải lấy mốc đầu từ header rồi nối các dòng history. Luật này ghi trong comment của `StatusChange.fromStatus`.

5. **`fromStatus` nullable dù luật ở note 4 nói không ghi lúc tạo** — để làm đường thoát cho **dữ liệu nhập từ ngoài vào** (không biết trạng thái trước). Hiện chưa có ca nào dùng.

6. **Ghi LUÔN nằm trong CÙNG transaction** với lệnh `UPDATE` đổi status, và **đặt SAU chốt `count === 0`**:

   ```ts
   const closed = await updateSalesOrderStatus(tx, id, order.status, {...});
   if (closed.count === 0) throw new ConflictError(...);   // ← chốt chống race
   await recordStatusChange(tx, {...});                     // ← ghi sau
   ```

   Tách transaction thì có lúc chứng từ đổi trạng thái xong mà lịch sử không ghi được → **mất dấu người thao tác vĩnh viễn**. Đặt trước chốt thì request thua cuộc cũng đẻ ra dòng lịch sử ma.

   Đã kiểm bằng test đồng thời: 6 request cùng huỷ 1 đơn → **đúng 1 dòng**.

7. **`changedByUserId` nullable** — `null` nghĩa là **hệ thống tự chuyển**, không có người nào bấm. Hiện có đúng một ca thật: job hết hạn của `reservation` (`PENDING → EXPIRED`). Ca sắp tới: webhook cổng thanh toán gọi `markOrderPaid(id, null)`.

8. **FK `onDelete: Restrict`** — xoá user không được xoá mất dấu người đã thao tác. Đồng nhất với phần còn lại của schema: đã đếm trên DB thật, hiện **38 `RESTRICT` + 1 `CASCADE`** (cái `CASCADE` duy nhất là `ProductCategory.productId`, có chủ ý).

   ⚠️ **`user.repository.countReferences` BẮT BUỘC đếm bảng này.** Khác với cột `cancelledByUserId` cũ — nơi mục `movement` vô tình phủ được vì huỷ phiếu luôn kèm 1 `InventoryMovement` — bảng này ghi cả những bước **không đụng kho** (VD `SalesOrder PENDING → PAID`), nên **không có mục nào phủ hộ**. Thiếu là xoá user rơi thẳng vào `P2003` → 500.

   Đã kiểm bằng test dựng đúng ca đó: user chỉ vướng 1 dòng history → ra **409 gọi đúng tên `documentStatusHistory`**, không phải 500.

9. **Bảng này KHÔNG có `updatedAt`** — cùng bản chất với audit log: immutable, chỉ INSERT.

10. **`@@index([documentType, documentId, createdAt])`** — truy vấn thật luôn là *"lấy lịch sử của chứng từ X theo thứ tự thời gian"*, có `createdAt` trong index thì Postgres khỏi sort lại. `@@index([changedByUserId])` phục vụ `countReferences` lúc xoá user.

11. **Không phân trang timeline, và hiện an toàn** — số bước của mỗi chứng từ có trần cứng (`SalesOrder` 4, `Transfer` 4, `Inbound` 3, `Reservation` 1, `InventoryAdjustment` 1) vì enum **không có đường quay lui** và mọi lệnh đổi đều qua `WHERE status = <nguồn>`, nên một chứng từ không thể đi qua cùng một bước hai lần.

    Chỉ cần xem lại **nếu sau này thêm luồng cho phép quay lại trạng thái cũ** (mở lại đơn đã huỷ, xuất hàng nhiều đợt). Lúc đó tách `GET /<module>/:id/timeline` có phân trang — rẻ và không phá contract.

## Ai ghi gì — trạng thái hiện tại

| Module | Bước | `changedByUserId` |
|---|---|---|
| `reservation` | `PENDING → CANCELLED` | người bấm huỷ |
| `reservation` | `PENDING → EXPIRED` | **`null`** — job hết hạn |
| `sales-order` | `PENDING → CANCELLED` · `PAID`/`CONFIRMED → REFUNDED` | người bấm |
| `sales-order` | `PENDING → PAID` | Manager/Admin (sau này: `null` nếu webhook) |
| `sales-order` | `PAID → CONFIRMED` | Manager/Admin |
| `sales-order` **ghi vào `RESERVATION`** | `PENDING → CONFIRMED` | khách bấm "Đặt mua" từ phiếu |
| `inbound`/`outbound`/`transfer`/`inventory-adjustment` | *chưa làm* | |

Dòng áp chót là ví dụ của quy ước **module sau ghi vào bảng module trước** — `sales-order.repository.ts` có hàm `confirmReservation`, không import chéo module. Xem `docs/Business_SalesOrder.md` note 12.

## Cách đọc

Không có endpoint riêng cho bảng này. Nó được đọc kèm trong chi tiết chứng từ:

| Endpoint | Trả gì | Ai thấy |
|---|---|---|
| `GET /sales-orders/:id` | `timeline[]` đầy đủ các bước | **Không phải CUSTOMER** |
| `GET /reservations/:id` | `cancelledBy` (dòng `CANCELLED` mới nhất) | **Không phải CUSTOMER** |

**Ẩn với khách** vì trong đó có tên nhân viên — thông tin nội bộ. Khách không mất gì: các mốc thời gian (`paidAt`, `cancelledAt`...) vẫn nằm trên header chứng từ nên vẫn biết nó đi tới đâu, lúc nào.

Cả hai endpoint **chỉ tra bảng này khi thật sự cần** — `reservation` chỉ tra khi phiếu đã `CANCELLED`, `sales-order` chỉ tra khi người xem không phải khách. Đường phổ biến nhất (khách xem chứng từ của mình) không tốn thêm câu truy vấn nào.

## Lịch sử quyết định

- Câu hỏi "ai đóng chứng từ" phát sinh khi làm `reservation`, **hoãn có chủ ý** vì module đó chỉ có đúng 1 bước người bấm — dựng cả bảng polymorphic cho 1 bước là quá tay, và không nên thiết kế từ module đơn giản nhất rồi ép 5 module kia vừa khuôn.
- Giải pháp tạm lúc đó: cột `Reservation.cancelledByUserId` (migration `20260814150918`).
- Quyết chính thức khi vào `sales-order` — module có **6 trạng thái, 4 bước người bấm**, tức luồng phức tạp thật để thiết kế dựa vào. Bảng tạo ở migration `20260817025022`, cột tạm gỡ ở `20260817030658`.
- Gỡ lúc bảng chưa có dữ liệu thật nên không tốn gì. Làm thành **commit riêng** để test `reservation` đỏ thì biết chắc do đâu.

Cùng lối với `utils/inventory.core.ts`: **rút từ code thật, không thiết kế mù.**
