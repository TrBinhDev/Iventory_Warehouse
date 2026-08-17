## Business — Reservation

```prisma
enum ReservationStatus {
  PENDING
  CONFIRMED
  CANCELLED
  EXPIRED
}

model Reservation {
  id            String              @id @default(uuid()) @db.Uuid

  code          String              @unique @db.VarChar(30)

  warehouseId   String              @db.Uuid
  warehouse     Warehouse           @relation(fields: [warehouseId], references: [id])

  customerId    String              @db.Uuid
  customer      User                @relation(fields: [customerId], references: [id])

  status        ReservationStatus   @default(PENDING)

  expiresAt     DateTime

  // Ai bấm huỷ nằm ở DocumentStatusHistory, không phải cột trên bảng này — xem note 11
  confirmedAt   DateTime?
  cancelledAt   DateTime?
  expiredAt     DateTime?
  cancelReason  String?

  items         ReservationItem[]

  createdAt     DateTime            @default(now())
  updatedAt     DateTime            @updatedAt

  @@index([status])
  @@index([expiresAt])
  @@index([warehouseId])
  @@index([customerId])
}

model ReservationItem {
  id              String        @id @default(uuid()) @db.Uuid

  reservationId   String        @db.Uuid
  reservation     Reservation   @relation(fields: [reservationId], references: [id])

  skuId           String        @db.Uuid
  sku             SKU           @relation(fields: [skuId], references: [id])

  quantity        Int

  unitPrice       Decimal       @db.Decimal(15, 2)

  createdAt       DateTime      @default(now())

  @@index([reservationId])
  @@index([skuId])
}
```

## Relationship

```text
Warehouse   (1) ─────────────< Reservation (N)
User        (1) ─────────────< Reservation (N)     // customer đặt trước
Reservation (1) ─────────────< ReservationItem (N)
SKU         (1) ─────────────< ReservationItem (N)

Reservation (1) ····<  DocumentStatusHistory (N)   // KHÔNG phải FK, nối bằng
                                                   // (documentType='RESERVATION', documentId)
```

## Note — các điểm quan trọng

1. **`warehouseId` đặt ở header, không ở item** — 1 Reservation chỉ giữ chỗ từ 1 kho duy nhất. Nếu kho đó không đủ hàng thì không tạo được, không tự động lấy bù từ kho khác (bù hàng là nghiệp vụ Transfer/Inbound riêng, xử lý sau).

2. **`customerId`** — gắn với người đặt, dùng `User` đã có sẵn (role `CUSTOMER`).

3. **`idempotencyKey` KHÔNG lưu trong bảng này** — xử lý ở Redis (`SET NX` + TTL 60s), check _ngoài_ transaction Postgres trước khi chạm DB. Transaction fail (VD hết hàng) thì **xoá key ngay** để khách thử lại được bằng chính key đó; không xoá thì lỗi nghiệp vụ bị che tới khi key hết hạn.

    **Đã chốt KHÔNG replay response.** Request trùng nhận `409 DUPLICATE_REQUEST`, client tự gọi `GET /reservations` để thấy phiếu. Nhờ vậy Redis chỉ lưu `1` thay vì cả response body, và không phải xử lý ca "request đầu chưa chạy xong nên chưa có gì để trả". Replay thật ra cũng chỉ cứu được ca retry-sau-timeout — double-click hai request cách nhau ~100ms thì request đầu còn đang chạy, dù chọn hướng nào request sau cũng nhận 409.

4. **`expiresAt` lưu DB, không lưu Redis** — vì việc nhả `reserved` phải atomic cùng transaction Postgres với update `Inventory`. Cơ chế trigger: BullMQ delayed job (schedule đúng lúc tạo Reservation, chạy 1 lần đúng thời điểm hết hạn) làm chính, cộng cron dự phòng tần suất thấp (15-30 phút/lần) quét row `status=PENDING AND expiresAt < NOW()` bị job chính bỏ sót (VD: Redis restart mất job).

5. **`ReservationItem.unitPrice` là snapshot giá tại thời điểm đặt** — không lấy `SKU.price` hiện tại lúc tính tiền sau này.

   Module `sales-order` **chép thẳng giá này sang `SalesOrderItem`** khi khách đặt mua từ phiếu, không đọc lại giá SKU. Giá đổi giữa chừng thì khách vẫn trả giá đã thấy lúc giữ chỗ — đó là lời hứa mà TTL 30 phút sinh ra để bảo đảm.

6. **Luồng tạo Reservation dùng Pessimistic Locking + Transaction:**

```
BEGIN transaction
  SELECT * FROM Inventory WHERE warehouseId=X AND skuId IN (...)
    ORDER BY skuId ASC   -- sort cố định để tránh deadlock giữa các transaction
    FOR UPDATE
  → tính available = onHand - reserved cho từng SKU
  → nếu bất kỳ SKU nào available < qty yêu cầu → throw, ROLLBACK toàn bộ
  → UPDATE Inventory SET reserved += qty, version += 1
  → INSERT Reservation + ReservationItem
  → INSERT InventoryMovement (audit log)
COMMIT → nhả lock
→ SAU KHI commit thành công mới schedule BullMQ delayed job (ngoài transaction DB)
```

7. **Fail do hết hàng giữa chừng → toàn bộ transaction rollback**, không tạo Reservation/ReservationItem nào, `Inventory` không đổi gì. API trả `409 Conflict`.

8. **`ReservationItem` không có `updatedAt`** — snapshot bất biến, không sửa sau khi tạo. Muốn đổi số lượng thì hủy Reservation cũ, tạo mới.

9. **`confirmedAt`/`cancelledAt`/`expiredAt`/`cancelReason`** — cần thiết vì `InventoryMovement` chỉ ghi log ở bước có chạm Inventory; các bước chuyển status không đụng Inventory (VD: `PENDING → CONFIRMED`) sẽ hoàn toàn mất dấu vết nếu thiếu field này. `expiredAt` tách riêng khỏi `cancelledAt` vì khác nguồn gốc: hệ thống tự động (BullMQ job/cron) vs người dùng chủ động hủy — quan trọng khi audit/debug.

11. **Ai bấm huỷ — nằm ở `DocumentStatusHistory`, không phải cột trên `Reservation`.** Các mốc thời gian ở note 9 cho biết *lúc nào* nhưng không cho biết *ai*, trong khi phiếu có thể bị huỷ bởi 3 nguồn: chính khách, Manager của kho, hoặc Admin. Thông tin này cũng nằm ở `InventoryMovement.createdByUserId` của dòng `RELEASE`, nhưng ở đó nó bị lặp theo từng SKU (phiếu 3 SKU → 3 dòng cùng một người) trong khi bản chất là dữ kiện cấp header.

    Từng có cột `cancelledByUserId` trên bảng này (migration `20260814150918`), **đã gỡ** ở migration `20260817030658` khi làm module `sales-order`. Lý do: 6 module nghiệp vụ mà mỗi bước có người bấm lại thêm một cột thì thành ~18 cột, mỗi cột là một chỗ có thể quên `countReferences` — đổi lấy 1 bảng dùng chung. Gỡ lúc bảng chưa có dữ liệu thật nên không tốn gì.

    Cách ghi hiện tại: `recordStatusChange` (`utils/status.core.ts`) chèn 1 dòng `DocumentStatusHistory` **trong cùng transaction** với lệnh `UPDATE` đổi status, và đặt **sau** chốt `count === 0` nên phiếu bị người khác đóng trước thì không đẻ dòng thừa. Cả 3 đường đóng phiếu đều ghi: huỷ tay ghi `changedByUserId` = người bấm, job hết hạn ghi `null`.

    Cách đọc: `GET /reservations/:id` chỉ tra bảng lịch sử khi phiếu `CANCELLED` **và** người xem không phải CUSTOMER — đường phổ biến nhất (khách xem phiếu đang `PENDING`) không tốn thêm câu truy vấn nào.

    `user.repository.countReferences` **bắt buộc** đếm `documentStatusHistory` (FK `Restrict`). Khác với cột cũ — nơi mục `movement` đã vô tình phủ được vì huỷ phiếu luôn kèm 1 `InventoryMovement` — bảng này ghi cả những bước **không đụng kho** (VD `SalesOrder PENDING → PAID`), nên không có mục nào phủ hộ. Thiếu là xoá user rơi thẳng vào `P2003` → 500.

10. **`code`** — mã phiếu dễ đọc dùng để hiển thị cho khách/nhân viên (VD `RES-20260814-000123`), tách biệt với `id` (UUID dùng nội bộ cho FK). `@unique` để DB chặn trùng nếu logic sinh code có bug.

     **Đã chốt: Postgres `SEQUENCE`** (`reservation_code_seq`, tạo bằng migration raw SQL). Chọn nó vì `nextval` atomic thật ở tầng DB — khác hẳn cách đếm row trong ngày rồi +1 (2 request cùng đếm ra một số) và cách Redis `INCR` (mất Redis là counter về 0, sinh mã trùng). Prisma không mô hình hoá sequence độc lập nên không khai trong `schema.prisma`; đã kiểm `migrate diff` không coi nó là drift.

     Hai đánh đổi đã chấp nhận, chỉ ảnh hưởng thẩm mỹ: số **không reset theo ngày**, và `nextval` **không rollback** nên transaction fail vẫn ăn mất một số, dãy có lỗ.

     **Phần ngày lấy theo giờ Việt Nam tường minh** (`Intl.DateTimeFormat` với `timeZone: "Asia/Ho_Chi_Minh"`), không dùng giờ local của process. Nếu dùng `getFullYear()` thì máy dev (ICT) và container production (UTC) cho ra hai mã khác nhau cho cùng một thời điểm. Hệ quả có chủ ý: mã có thể lệch ngày với `createdAt` (lưu UTC) trong khung 00:00–07:00 giờ VN — chấp nhận được vì `code` là nhãn hiển thị, muốn lọc theo ngày thì dùng `createdAt`.

---

## API đã triển khai

| Method | Path | Chức năng nghiệp vụ | Ghi `Inventory` |
|---|---|---|---|
| `POST` | `/reservations` | Khách bấm "Giữ chỗ" — kiểm đủ hàng, khoá tồn, tạo phiếu | ✅ `reserved +=` |
| `GET` | `/reservations` | Khách xem phiếu của mình; nhân viên xem hàng đang bị treo ở kho mình | ❌ |
| `GET` | `/reservations/:id` | Chi tiết phiếu + dòng hàng + còn bao lâu hết hạn | ❌ |
| `PATCH` | `/reservations/:id/cancel` | Nhả hàng về bán tiếp ngay, không chờ hết 30 phút | ✅ `reserved -=` |

`GET /reservations` nhận: `page`, `limit`, `status`, `code`, `warehouseId`, `skuId`, `from`, `to`. Sắp xếp mặc định `createdAt` giảm dần (chứng từ, khác module `inventory` sắp theo mã). `skuId` lọc bằng `items.some` — phục vụ câu hỏi *"onHand 50 mà available 2, ai đang giữ 48 cái kia"*. `from`/`to` lọc theo `createdAt` để drill-down từ dashboard.

## Phân quyền

| Hành động | CUSTOMER | STAFF | MANAGER | ADMIN |
|---|---|---|---|---|
| Tạo phiếu | ✅ cho chính mình | ❌ | ❌ | ❌ |
| Xem danh sách | ✅ phiếu của mình | ✅ kho mình | ✅ kho mình | ✅ tất cả |
| Xem chi tiết | ✅ phiếu của mình | ✅ kho mình | ✅ kho mình | ✅ tất cả |
| Huỷ phiếu | ✅ phiếu của mình, chỉ khi `PENDING` | ❌ | ✅ kho mình | ✅ tất cả |

- Ngoài phạm vi trả **404** chứ không phải 403 — để không lộ ra rằng phiếu đó có tồn tại ở kho khác.
- Manager/Staff **không gắn kho** thì danh sách trả rỗng (fail closed), không phải thấy tất cả.
- **STAFF không được huỷ**: nới quyền về sau chỉ là thêm một role vào `authorize`, còn thu hồi quyền đã phát hành thì phải đụng tới quy trình đang chạy. Tình huống "khách gọi hotline mà Manager không có mặt" là vấn đề trực ca, không nên nới quyền để bù.
- **`cancelReason` bắt buộc khi Manager/Admin huỷ**, không bắt buộc khi khách tự huỷ: khách huỷ phiếu của chính mình thì `customerId` đã nói ai làm, nhân viên huỷ đơn người khác thì phải giải trình.
- **Chi tiết ẩn `cancelledBy` với CUSTOMER** — tên nhân viên là thông tin nội bộ. Khách vẫn thấy `cancelledAt` và `cancelReason` nên đủ biết phiếu bị huỷ lúc nào, vì sao.

## ⚠️ Module NGOÀI đụng trạng thái của bảng này

| Module | Hàm | Làm gì |
|---|---|---|
| `sales-order` | `confirmReservation` trong `sales-order.repository.ts` | `PENDING → CONFIRMED` khi khách bấm "Đặt mua" từ phiếu (`POST /sales-orders/from-reservation`) |

**`CONFIRMED` không do module này đặt** — `reservation` cố ý không có API confirm. Convert phiếu thành đơn **chính là** bước confirm: câu `UPDATE ... WHERE status = 'PENDING'` bên `sales-order` vừa đổi trạng thái vừa là chốt chống race, nằm trong cùng transaction tạo đơn.

Vì sao không tách 2 bước: giữa chúng phiếu sẽ ở `CONFIRMED` mà chưa có đơn → job hết hạn thấy status khác `PENDING` nên thoát êm → **hàng treo vĩnh viễn, không TTL nào cứu**.

Chiều luôn là **module sau ghi vào bảng module trước**; `reservation` không biết `sales-order` tồn tại. Chi tiết ở `docs/Business_SalesOrder.md` note 2 và 12.

Hệ quả với job hết hạn: phiếu đã chuyển thành đơn thì `status = CONFIRMED`, nên chốt `WHERE status = 'PENDING'` tự động bỏ qua — **job không bao giờ nhả mất hàng của một đơn đã đặt**.

## Luật huỷ và hết hạn

Ba đường cùng dẫn tới "nhả `reserved`": khách huỷ, nhân viên huỷ, job hết hạn. Cả ba **bắt buộc** đi qua cùng một chốt:

```sql
UPDATE "Reservation" SET status = ... WHERE id = ? AND status = 'PENDING'
```

Đổi status là **điều kiện**, không phải hệ quả. 0 dòng nghĩa là người khác đã xử lý xong trước. Không có chốt này thì khách bấm huỷ đúng giây job hết hạn chạy sẽ trừ `reserved` **hai lần** → `available` phình ảo → bán vượt số hàng thật có.

Khác nhau giữa ba đường:

| | Huỷ (API) | Hết hạn (job) |
|---|---|---|
| Status | `CANCELLED` + `cancelledAt` | `EXPIRED` + `expiredAt`, `cancelledAt` để `null` |
| `DocumentStatusHistory` | 1 dòng `PENDING → CANCELLED`, `changedByUserId` = người bấm | 1 dòng `PENDING → EXPIRED`, `changedByUserId` = **`null`** |
| `InventoryMovement.createdByUserId` | id người bấm | **`null`** — hệ thống tự làm |
| Khi `updateMany` trả 0 dòng | **409** — người dùng cần biết vì sao không được | **Thoát êm** — job chạy nền, không ai đọc lỗi |

## Hợp đồng với frontend — `Idempotency-Key`

Header **bắt buộc** cho `POST /reservations`, thiếu là 400.

> Client sinh UUID **một lần cho một ý định đặt hàng**, rồi dùng lại cho mọi lần gửi lại của chính ý định đó.

Sinh UUID mới **mỗi lần bấm nút** thì 2 lần bấm ra 2 key khác nhau, server thấy 2 request hợp lệ và tạo 2 phiếu — **cơ chế chống trùng mất tác dụng hoàn toàn**. Cụ thể: sinh lúc mở form (hoặc lúc bấm lần đầu), giữ nguyên tới khi nhận được response cuối cùng, xong mới bỏ.

## Đã chốt KHÔNG làm giới hạn chống lạm dụng

Giữ chỗ miễn phí nên về lý thuyết một khách có thể khoá sạch kho trong 30 phút. **Đã cân nhắc rồi bỏ** toàn bộ: giới hạn số phiếu `PENDING`/customer, giới hạn số lượng/SKU, giới hạn tổng lượng đang giữ, giới hạn theo % `available`, trần số SKU/phiếu, và `pg_advisory_xact_lock` để chống race cho các phép đếm đó.

Ba lớp phòng vệ được coi là đủ:

| Lớp | Chặn cái gì |
|---|---|
| Verify email | Tạo tài khoản hàng loạt để lách |
| TTL 30 phút | Đặt trần thời gian, hàng tự nhả về |
| `available` | Không giữ được quá số hàng thật có |

Lý do bỏ: (1) bài toán không có lời giải tối ưu — mọi mức siết đều đánh đổi "chặn kẻ lạm dụng" lấy "chặn nhầm khách thật" theo đúng tỉ lệ; (2) thiệt hại **tự lành** sau TTL, khác hẳn oversell/lệch tồn là hỏng vĩnh viễn — đây là **chính sách kinh doanh**, không phải bug đúng đắn; (3) thêm sau là ràng buộc chặt hơn, không phá contract.

Lỗ hổng chấp nhận có ý thức: kho còn ít hơn nhu cầu thì 1 khách vẫn ôm sạch · hết hạn rồi giữ lại ngay, lặp vô hạn · lách bằng nhiều tài khoản.

Hai thứ **vẫn làm** vì thuộc tính đúng của con số chứ không phải chính sách: `quantity` phải là số nguyên dương (số âm làm `reserved` giảm → `available` tăng ảo → oversell thật), và client gửi trùng `skuId` thì **gộp cộng số lượng** ở service (không gộp thì cùng một dòng `Inventory` bị tính hai lần).

## Tự động hết hạn

- **Đường chính:** BullMQ delayed job hẹn đúng `expiresAt`, đặt lịch **sau khi transaction commit**. Hẹn bên trong transaction mà rollback thì job vẫn tồn tại và sẽ đi nhả hàng của một phiếu chưa từng ra đời.
- **Lưới đỡ:** job lặp 15 phút quét `PENDING AND expiresAt < NOW()`, cho ca commit xong nhưng Redis chết nên mất job. Mỗi phiếu một transaction riêng — gom hết vào một transaction sẽ khoá quá nhiều dòng `Inventory` cùng lúc và chặn khách đang mua.
- Worker tách khỏi Express (`src/queues/`), khởi động từ `server.ts`. Muốn chạy process riêng chỉ cần thêm entry gọi `createReservationWorker()` + `registerSweepJob()`, không sửa logic.
- Producer và worker **mỗi bên một connection Redis** với `maxRetriesPerRequest: null`: worker dùng lệnh blocking `BZPOPMIN`, dùng chung thì producer không add job được; và Redis chính của app để `3` nên truyền vào sẽ throw.

## `utils/inventory.core.ts` — khuôn dùng chung cho mọi module ghi `Inventory`

Rút ra sau khi `reservation` có đủ 3 chỗ ghi thật (tạo, huỷ, hết hạn), không thiết kế trước.

```
lockInventoryRows(tx, warehouseId, skuIds)      → luôn ORDER BY "skuId" trước FOR UPDATE
applyInventoryDeltas(tx, rows, deltas, meta)    → update + ghi movement, CÙNG transaction
```

Chỉ bọc phần **bất biến giữa mọi module**: thứ tự khoá, lấy before/after từ dòng đã khoá, ghi `InventoryMovement` cùng transaction. Điều kiện chặn nghiệp vụ **để lại ở caller** vì mỗi module một kiểu — `reservation` xét `available`, `outbound` xét cả `onHand` lẫn `reserved`, `inbound` không xét gì.

Lý do bọc `ORDER BY "skuId"`: bỏ nó đi thì 2 giao dịch đụng cùng bộ SKU theo thứ tự ngược nhau sẽ ôm chéo lock, **mà test tuần tự vẫn pass 100%** — chỉ lộ khi chạy đồng thời. Gói lại một chỗ để không module nào chép lệch được.

`deltas` là số **cộng thêm** (âm là trừ), không phải giá trị tuyệt đối: hai luồng cùng chạy mà ghi giá trị tuyệt đối sẽ đè nhau, còn `increment` thì DB tự cộng dồn trên dòng đã khoá.

**`inventory-adjustment` sẽ không dùng file này** — nó khoá optimistic bằng `version`, không dùng `FOR UPDATE`.
