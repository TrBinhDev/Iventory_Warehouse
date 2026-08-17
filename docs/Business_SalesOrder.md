## Business — SalesOrder

```prisma
enum SalesOrderStatus {
  PENDING
  PAID
  CONFIRMED
  COMPLETED
  CANCELLED
  REFUNDED
}

model SalesOrder {
  id              String              @id @default(uuid()) @db.Uuid

  code            String              @unique @db.VarChar(30)

  warehouseId     String              @db.Uuid
  warehouse       Warehouse           @relation(fields: [warehouseId], references: [id])

  customerId      String              @db.Uuid
  customer        User                @relation(fields: [customerId], references: [id])

  // @unique: 1 phiếu giữ chỗ chỉ đẻ ra được 1 đơn. Postgres cho nhiều NULL trong unique index
  // nên đơn mua thẳng không vướng. Xem note 10.
  reservationId   String?             @unique @db.Uuid
  reservation     Reservation?        @relation(fields: [reservationId], references: [id], onDelete: Restrict)

  status          SalesOrderStatus    @default(PENDING)

  totalAmount     Decimal             @db.Decimal(15, 2)

  paidAt          DateTime?
  confirmedAt     DateTime?
  completedAt     DateTime?
  cancelledAt     DateTime?
  refundedAt      DateTime?
  cancelReason    String?

  items           SalesOrderItem[]

  createdAt       DateTime            @default(now())
  updatedAt       DateTime            @updatedAt

  @@index([status])
  @@index([warehouseId])
  @@index([customerId])
  // Không có @@index([reservationId]) — unique index ở trên đã phục vụ tra cứu
}

model SalesOrderItem {
  id            String        @id @default(uuid()) @db.Uuid

  salesOrderId  String        @db.Uuid
  salesOrder    SalesOrder    @relation(fields: [salesOrderId], references: [id])

  skuId         String        @db.Uuid
  sku           SKU           @relation(fields: [skuId], references: [id])

  quantity      Int

  unitPrice     Decimal       @db.Decimal(15, 2)

  createdAt     DateTime      @default(now())

  @@index([salesOrderId])
  @@index([skuId])
}
```

## Relationship

```text
Warehouse   (1) ─────────────< SalesOrder (N)
User        (1) ─────────────< SalesOrder (N)      // customer mua hàng
Reservation (1) ───────────── SalesOrder (0..1)    // nullable + @unique: 1 phiếu tối đa 1 đơn
SalesOrder  (1) ─────────────< SalesOrderItem (N)
SKU         (1) ─────────────< SalesOrderItem (N)

SalesOrder  (1) ····< DocumentStatusHistory (N)    // KHÔNG phải FK, nối bằng
                                                   // (documentType='SALES_ORDER', documentId)
```

## Note — các điểm quan trọng

1. **Không có `expiresAt`** — khác với Reservation, Buy Now là quyết định mua ngay, không có khái niệm giữ chỗ tạm thời có hạn.

2. **Hai luồng tạo đơn — TÁCH THÀNH 2 ENDPOINT, không rẽ nhánh trong 1 body.**

   | Khách làm gì | Endpoint | Body |
   |---|---|---|
   | Mua ngay | `POST /sales-orders` | `{ warehouseId, items[] }` |
   | Đặt mua từ phiếu đã giữ | `POST /sales-orders/from-reservation` | `{ reservationId }` |

   **Luồng A — mua thẳng:**
   ```
   BEGIN transaction
     lockInventoryRows  → SELECT ... ORDER BY "skuId" FOR UPDATE
     → check available, đủ thì applyInventoryDeltas({ reserved: +qty })
     → nextval('sales_order_code_seq') → INSERT SalesOrder + SalesOrderItem
     → INSERT InventoryMovement (RESERVE / SALES_ORDER)
   COMMIT
   ```

   **Luồng B — từ phiếu giữ chỗ:**
   ```
   BEGIN transaction
     UPDATE "Reservation" SET status='CONFIRMED', confirmedAt=now()
       WHERE id = ? AND status = 'PENDING'     ← 0 dòng thì 409
     → recordStatusChange(RESERVATION, PENDING → CONFIRMED)
     → đọc ReservationItem → INSERT SalesOrder + SalesOrderItem (chép cả unitPrice)
     → KHÔNG đụng Inventory, KHÔNG đọc bảng SKU
   COMMIT
   ```

   **Đính chính bản trước của note này:** nó viết luồng B là *"check `Reservation.status = CONFIRMED`"* — **sai**. Module `reservation` cố ý không có API confirm, nên không có gì đặt `CONFIRMED` cả; làm đúng chữ đó thì luồng B không bao giờ chạy được. Đúng phải là **convert CHÍNH LÀ confirm**: câu `UPDATE` ở trên vừa đổi trạng thái vừa là chốt chống race, nằm trong cùng transaction tạo đơn.

   Đã loại cách đọc "có bước xác nhận riêng trước khi convert": giữa 2 bước đó phiếu ở `CONFIRMED` mà chưa có đơn → job hết hạn thấy status khác `PENDING` nên thoát êm → **hàng treo vĩnh viễn, không TTL nào cứu**.

   ⚠️ Rẽ nhầm nhánh là `reserved` tăng gấp đôi cho cùng một lượng hàng. Tách 2 endpoint chính là để chuyện đó **không diễn đạt ra được**: một request không thể vừa là mua thẳng vừa là mua từ phiếu. Gộp 1 endpoint thì client gửi được body lai `{reservationId, warehouseId, items}` và server phải đoán ý — đã đo bằng Zod v4: schema phẳng mọi field optional **không chặn** được body lai vì `z.object` mặc định lược bỏ field lạ mà không báo lỗi.

3. **`REFUNDED` dùng chung endpoint với huỷ**, không có endpoint riêng: `PATCH /:id/cancel` tự chọn trạng thái đích theo trạng thái hiện tại — `PENDING` → `CANCELLED`, đã thu tiền (`PAID`/`CONFIRMED`) → `REFUNDED`.

   Lý do gộp: tác động tồn kho **y hệt nhau** (nhả `reserved`), chỉ khác nghĩa kế toán. Gộp hết thành `CANCELLED` thì mất dấu khoản phải hoàn; tách 2 endpoint thì người gọi phải tự đoán đơn đang ở đâu, đoán sai là 409.

   Chỉ set **một** mốc thời gian khớp trạng thái đích (`cancelledAt` **hoặc** `refundedAt`), không set cả hai — cùng cách `Reservation` tách `cancelledAt` với `expiredAt` theo nguồn gốc.

   Hoàn tiền ở đây chỉ là **đánh dấu**, chưa có nghiệp vụ chuyển tiền thật.

4. **`totalAmount` lưu snapshot, không tính runtime** — khác với `quantityAvailable` ở Inventory (bắt buộc tính runtime để đảm bảo đúng đắn chống oversell), field này chỉ phục vụ hiển thị/báo cáo, không ảnh hưởng đến tính đúng đắn của concurrency. Lưu sẵn tránh phải JOIN + SUM mỗi lần hiển thị, và tổng tiền cuối có thể khác `SUM(quantity * unitPrice)` đơn giản nếu sau này có giảm giá/phí ship.

5. **`SalesOrderItem.unitPrice` là snapshot giá tại thời điểm mua** — cùng nguyên tắc với `ReservationItem.unitPrice`, không lấy giá SKU hiện tại.

   **Luồng B chép thẳng `unitPrice` từ `ReservationItem`**, không đọc lại giá SKU. Khách giữ chỗ lúc 10:00 với giá 100k, admin đổi giá lúc 10:15 thành 120k, khách bấm đặt mua lúc 10:20 → vẫn **100k**. Giữ chỗ là một lời hứa: cả cơ chế TTL 30 phút sinh ra để nói với khách *"trong 30 phút này hàng và giá là của bạn"*.

   **Hệ quả có chủ ý:** luồng B **không đọc bảng SKU lần nào**, nên cũng **không kiểm `SKU.status`** — admin cho SKU ngừng kinh doanh giữa chừng thì khách vẫn đặt mua được. Đúng, vì hàng đã bị giữ vật lý cho khách rồi; chặn ở bước cuối chỉ làm khách bực mà kho vẫn phải nhả hàng ra.

   `totalAmount` **luôn tính lại ở server** (`Σ unitPrice × quantity`) ở cả hai luồng, không bao giờ nhận từ client.

6. **`Outbound` xử lý xuất hàng dựa trên `SalesOrderItem`** — không phân biệt SalesOrder đến từ luồng A hay B, đều trừ `onHand` và `reserved` như nhau khi xuất kho thật.

7. **Không có `shippingAddress`** — ngoài phạm vi project (tập trung concurrency/locking, không phải luồng giao vận).

8. **`paidAt`/`confirmedAt`/`completedAt`/`cancelledAt`/`refundedAt`/`cancelReason`** — cùng nguyên tắc với Reservation: track đầy đủ mọi bước chuyển status, kể cả bước không đụng Inventory (VD: `PENDING → PAID` chỉ là xác nhận thanh toán, không chạm Inventory). Không có `expiredAt` vì `SalesOrder` không có status `EXPIRED` (Buy Now không có TTL, khác Reservation).

   Các cột này cho biết **lúc nào**, còn **ai bấm** nằm ở `DocumentStatusHistory` — xem note 11.

9. **`code`** — mã đơn hàng dễ đọc (`SO-YYYYMMDD-XXXXXX`, VD `SO-20260817-000001`), tách biệt `id` UUID.

   Sinh từ Postgres `SEQUENCE` (`sales_order_code_seq`, tạo bằng migration raw SQL) — `nextval` atomic thật ở tầng DB, khác hẳn cách đếm row trong ngày rồi +1. Cùng khuôn và cùng đánh đổi với `reservation_code_seq`: số **không reset theo ngày**, và `nextval` **không rollback** nên transaction fail vẫn ăn mất một số. Phần ngày lấy theo **giờ Việt Nam tường minh** (`Intl.DateTimeFormat` với `timeZone: "Asia/Ho_Chi_Minh"`), không dùng giờ local của process.

   Prisma không mô hình hoá sequence độc lập nên không khai trong `schema.prisma`; đã kiểm `migrate diff` không coi nó là drift.

10. **`reservationId` có `@unique`** — diễn đạt luật "1 phiếu giữ chỗ → tối đa 1 đơn" ở tầng DB. Postgres coi mỗi `NULL` là khác nhau nên nhiều đơn mua thẳng vẫn nằm chung được.

    **Nói cho đúng: nó KHÔNG bịt race nào.** Luồng B chạy `UPDATE Reservation ... WHERE status = 'PENDING'` trước, câu đó tự khoá dòng phiếu nên 2 request bị xếp hàng và request thứ hai nhận 0 dòng → 409. Ràng buộc unique ở đây để **chặn code viết sai trong tương lai** quên mất luật. Service vẫn bắt `P2002` đổi thành 409 `RESERVATION_ALREADY_CONVERTED` làm lưới đỡ cuối — đường bình thường không tới được đó.

    Gỡ luôn `@@index([reservationId])` vì unique index đã phục vụ tra cứu; giữ cả hai là 2 index trùng chức năng trên cùng một cột.

11. **Ai bấm bước nào — nằm ở `DocumentStatusHistory`, bảng dùng chung cho cả 6 module nghiệp vụ.**

    Đơn có tới 4 bước người bấm (`PAID`, `CONFIRMED`, `COMPLETED`, huỷ/hoàn), mà `InventoryMovement` chỉ ghi ở bước chạm tồn kho — 3 trong 4 bước đó **hoàn toàn vô hình** với audit số lượng. Đó là lý do bảng history tồn tại, và module này là ca dùng đầu tiên thực sự cần nó.

    Cách ghi: `recordStatusChange` (`utils/status.core.ts`) chèn 1 dòng **trong cùng transaction** với lệnh `UPDATE` đổi status, và đặt **sau** chốt `count === 0` nên đơn bị người khác đóng trước không đẻ dòng thừa.

    **KHÔNG ghi dòng nào lúc TẠO đơn** — bảng là nhật ký *chuyển* trạng thái, mà lúc tạo thì chưa chuyển gì; ai tạo + lúc nào đã có sẵn ở `customerId` + `createdAt`. Chép lại chỉ tạo 2 nguồn cho cùng một dữ kiện, và tốn thêm 1 `INSERT` ngay trong transaction đang giữ lock `FOR UPDATE` trên `Inventory`.

    `changedByUserId` **null** nghĩa là hệ thống tự chuyển — chưa có ca nào hiện tại, nhưng webhook cổng thanh toán sau này sẽ rơi vào đúng đó.

12. **`sales-order` GHI vào bảng `Reservation`** (luồng B đặt `PENDING → CONFIRMED`), qua hàm `confirmReservation` viết trong `sales-order.repository.ts`.

    Theo quy ước dự án: module nào cần đổi trạng thái chứng từ của module khác thì **tự viết hàm trong module mình**, không import chéo module. Chiều luôn là **module sau ghi vào bảng module trước** — `reservation` không biết `sales-order` tồn tại. Cần chiều ngược lại là dấu hiệu thiết kế sai, dừng lại hỏi.

    Sắp tới `outbound` sẽ ghi vào `SalesOrder` theo đúng khuôn này (đặt `COMPLETED`).

13. **⚠️ Thứ tự khoá — lưu ý cho module `outbound`.**

    `cancelSalesOrder` khoá theo thứ tự **`SalesOrder` trước → `Inventory` sau**. `createSalesOrder` thì ngược lại, nhưng không sao vì nó `INSERT` dòng mới chứ không tranh chấp dòng đang có.

    `outbound` sẽ khoá `Inventory` trước rồi mới `UPDATE SalesOrder` → hai transaction chạy đồng thời trên cùng đơn + cùng SKU sẽ **ôm chéo lock**, Postgres bắn `40P01` và giết một bên. Phase 1 của `outbound` phải nêu rõ thứ tự khoá.

---

## API đã triển khai

| Method | Path | Chức năng nghiệp vụ | Ghi `Inventory` |
|---|---|---|---|
| `POST` | `/sales-orders` | Khách bấm "Mua ngay" — kiểm đủ hàng, khoá tồn, tạo đơn | ✅ `reserved +=` |
| `POST` | `/sales-orders/from-reservation` | Khách bấm "Đặt mua" từ phiếu đã giữ chỗ | ❌ hàng đã bị giữ sẵn |
| `GET` | `/sales-orders` | Danh sách có phân trang, lọc, tra khách hàng | ❌ |
| `GET` | `/sales-orders/:id` | Chi tiết + dòng hàng + dòng thời gian ai bấm bước nào | ❌ |
| `PATCH` | `/sales-orders/:id/pay` | Xác nhận đã nhận tiền của khách | ❌ |
| `PATCH` | `/sales-orders/:id/confirm` | Duyệt đơn, cho kho chuẩn bị hàng | ❌ |
| `PATCH` | `/sales-orders/:id/cancel` | Huỷ đơn — nhả hàng về bán tiếp | ✅ `reserved -=` |

`GET /sales-orders` nhận: `page`, `limit`, `status`, `code`, `warehouseId`, `skuId`, `from`, `to`, `customer`, `customerId`. Sắp mặc định `createdAt` giảm dần.

- **`customer` là MỘT ô tìm cho 3 cột** — `fullName` **hoặc** `email` **hoặc** `phone`. Nhân viên nghe điện thoại có gì gõ nấy, không phải chọn trước đang tra bằng gì. Nhánh sđt so bằng chuỗi đã qua `normalizePhone`, nên gõ `090 123 4567` hay `+84901234567` đều khớp số lưu dạng `0901234567`; gõ chữ thì nhánh đó bị bỏ khỏi mệnh đề `OR`. Có 3 index GIN trigram trên `User` phục vụ việc này.
- **`skuId`** — đơn nào đang giữ SKU này. Từ khi có module này, hàng bị giữ nằm ở **cả `Reservation` lẫn `SalesOrder`**, chỉ tra một bên sẽ ra thiếu và người xem tưởng tồn kho bị lệch.
- **`status` + `from`/`to`** — xem phần "Đã chốt KHÔNG làm TTL" bên dưới.
- `customer`/`customerId` **bị bỏ qua với role CUSTOMER** — họ vốn chỉ thấy đơn của chính mình, nên gửi lên cũng không lách được.

## Phân quyền

| Hành động | CUSTOMER | STAFF | MANAGER | ADMIN |
|---|---|---|---|---|
| Tạo đơn (cả 2 luồng) | ✅ cho chính mình | ❌ | ❌ | ❌ |
| Xem danh sách / chi tiết | ✅ đơn của mình | ✅ kho mình | ✅ kho mình | ✅ tất cả |
| `pay` | ❌ | ❌ | ✅ kho mình | ✅ |
| `confirm` | ❌ | ❌ | ✅ kho mình | ✅ |
| Huỷ | ✅ chỉ khi `PENDING` | ❌ | ✅ kho mình | ✅ |

- Ngoài phạm vi trả **404** chứ không phải 403 — không lộ ra rằng đơn đó tồn tại ở kho khác. Kiểm phạm vi đặt **ngay sau kiểm tồn tại, trước mọi kiểm nghiệp vụ**: đảo lại thì khách gửi id đơn người khác sẽ nhận 409 và biết được đơn đó có thật *lẫn* đang ở trạng thái nào.
- **Staff chỉ xem trong module này.** `sales-order` là chứng từ bàn giấy; việc tay chân của Staff nằm ở `outbound`/`inbound`/`transfer`. Ranh giới: **Staff động vào hàng, Manager động vào chứng từ và tiền.**
- **`pay` cũng Manager** vì không có đường lùi (enum không có `PAID → PENDING`), bấm nhầm là phải huỷ/hoàn — mà cả hai cũng đều Manager. Và đây là thao tác duy nhất trong hệ thống đụng tiền, trong khi dự án không có vai kế toán.
- **Khách chỉ huỷ được đơn `PENDING`.** Chưa có tiền vào thì chưa mất gì; từ lúc đã thu tiền, mọi thao tác phải có người của kho đứng tên.
- **Chi tiết ẩn `timeline` với CUSTOMER** — tên nhân viên là thông tin nội bộ, cùng lý do `reservation` ẩn `cancelledBy`. Khách không mất gì: 5 mốc thời gian vẫn nằm trên header đơn.

## Luồng trạng thái

| Trạng thái | Ai đặt | `Inventory` | Mốc thời gian |
|---|---|---|---|
| `PENDING` | tự có khi tạo đơn | Luồng A `reserved +=` · Luồng B không đụng | `createdAt` |
| `PAID` | Manager/Admin | ❌ | `paidAt` |
| `CONFIRMED` | Manager/Admin | ❌ | `confirmedAt` |
| `COMPLETED` | **module `outbound`** | ✅ `onHand -=` **và** `reserved -=` | `completedAt` |
| `CANCELLED` | Khách (khi `PENDING`) / Manager/Admin | ✅ `reserved -=` | `cancelledAt` |
| `REFUNDED` | Manager/Admin (từ `PAID`/`CONFIRMED`) | ✅ `reserved -=` | `refundedAt` |

Hàng bị giữ **từ lúc tạo đơn tới lúc `outbound` xuất thật** — 3 bước giữa không đụng tồn kho một chút nào. Chỉ có **2 điểm** chạm tồn kho trong cả vòng đời, cách nhau rất xa; đó là lý do rẽ nhầm nhánh ở bước tạo đơn nguy hiểm mà không bước nào sau đó phát hiện ra.

Mọi lệnh đổi trạng thái đều đi qua cùng một chốt:

```sql
UPDATE "SalesOrder" SET status = ... WHERE id = ? AND status = <trạng thái nguồn>
```

Đổi status là **điều kiện**, không phải hệ quả. 0 dòng nghĩa là người khác xử lý xong trước → 409.

**Ở `cancel` phải khoá theo ĐÚNG trạng thái đã đọc, không phải `status IN (...)`**: trạng thái đích tính từ trạng thái đọc được (`PENDING` → `CANCELLED`, còn lại → `REFUNDED`). Khoá theo danh sách thì đơn `PENDING` bị Manager khác chuyển sang `PAID` xen giữa vẫn khớp `WHERE`, và ta sẽ ghi `CANCELLED` cho một đơn đã thu tiền — mất dấu khoản phải hoàn.

⚠️ Chữ `PENDING` và `CONFIRMED` xuất hiện ở **cả `Reservation` lẫn `SalesOrder` với nghĩa khác nhau** — dễ lẫn khi đọc code.

## Hợp đồng với frontend — `Idempotency-Key`

Header **bắt buộc** cho 3 endpoint, thiếu là 400:

```
POST  /sales-orders
POST  /sales-orders/from-reservation
PATCH /sales-orders/:id/pay
```

> Client sinh UUID **một lần cho một ý định**, rồi dùng lại cho mọi lần gửi lại của chính ý định đó.

Sinh UUID mới mỗi lần bấm nút thì cơ chế chống trùng mất tác dụng hoàn toàn.

`/pay` bắt buộc header này dù chốt `WHERE status='PENDING'` đã chặn bấm 2 lần — vì đây là chỗ **webhook cổng thanh toán** sẽ gọi sau này, mà webhook retry là chuyện thường. Thêm header sau khi frontend đã tích hợp thì là phá contract, nên đặt sẵn từ đầu.

`/confirm` và `/cancel` **không** cần: không đụng tiền, không có bên thứ ba nào gọi lại.

**Dọn đường cho cổng thanh toán:** hàm service tách 2 tầng — `payOrder(actor, id, key)` cho người bấm, và `markOrderPaid(id, changedByUserId: string | null)` là lõi transaction nhận `null` ngay từ bây giờ. Khi có webhook thật chỉ cần thêm route với middleware xác thực chữ ký, phần nghiệp vụ không sửa gì.

## Đã chốt KHÔNG làm TTL cho đơn chưa thanh toán

Đơn `PENDING` giữ hàng **vô thời hạn** cho tới khi có người huỷ. Đã cân nhắc TTL tự huỷ rồi **bỏ**: nhân viên dù sao cũng phải mở từng đơn để bấm `PAID`, nên việc "ai đó phải để mắt tới đơn" vốn đã nằm trong quy trình.

Chỗ gợn duy nhất — *"đơn bị bỏ ngang không tạo sự kiện nào để ai chú ý"* — được giải quyết bằng **filter**, không phải bằng TTL:

```
GET /sales-orders?status=PENDING&to=<ngày>
```

Bấm một cái ra hết đơn cũ bị bỏ ngang, huỷ hàng loạt. TTL không giải quyết thêm gì mà filter không giải quyết được, chỉ khác ai bấm nút.

**Điều kiện để chốt này đứng được: `status` + `from`/`to` phải có ngay từ đầu** — chúng chính là thứ thay cho TTL, cùng vai trò `GET`/`cancel` đã gánh cho idempotency ở `reservation`.

Lỗ hổng chấp nhận có ý thức: đơn `PENDING` bị quên thì hàng treo cho tới khi có người dọn.

## Ca "khách trả hàng đã giao" không thuộc module này

Đơn đã `COMPLETED` thì **không huỷ được** (409) — hàng đã ra khỏi kho. Muốn nhận lại hàng phải làm phiếu `Inbound` với `InboundReason = CUSTOMER_RETURN` (schema đã có sẵn). Đó là nhập kho thật, có đếm hàng, có kiểm tình trạng — khác hẳn việc sửa trạng thái một chứng từ.
