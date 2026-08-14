import { Prisma } from "@prisma/client";

// Dòng tồn đã bị khoá, kèm số trước khi thay đổi. $queryRaw không có type tự sinh nên khai tay.
export interface LockedInventoryRow {
  id: string;
  skuId: string;
  quantityOnHand: number;
  quantityReserved: number;
}

// Số CỘNG THÊM vào dòng tồn, âm là trừ. Không truyền giá trị tuyệt đối vì hai luồng
// cùng chạy sẽ ghi đè nhau; increment/decrement thì DB tự cộng dồn trên giá trị đã khoá.
export interface InventoryDelta {
  skuId: string;
  onHand?: number;
  reserved?: number;
}

export interface MovementMeta {
  movementType: Prisma.InventoryMovementCreateManyInput["movementType"];
  referenceType: Prisma.InventoryMovementCreateManyInput["referenceType"];
  referenceId: string;
  // null khi hệ thống tự làm (job hết hạn), không có người nào thao tác
  createdByUserId: string | null;
  note?: string;
}

// Khoá các dòng tồn bằng SELECT ... FOR UPDATE và trả về map tra theo skuId.
//
// ĐÂY LÀ LÝ DO FILE NÀY TỒN TẠI: ORDER BY "skuId" phải đứng trước FOR UPDATE ở MỌI luồng ghi.
// Thiếu nó thì 2 giao dịch đụng cùng bộ SKU theo thứ tự ngược nhau sẽ ôm chéo lock rồi chờ
// nhau — mà test tuần tự vẫn pass 100%, chỉ lộ khi chạy đồng thời. Gói lại một chỗ để không
// module nào chép lệch được.
//
// Tên bảng/cột bắt buộc để trong nháy kép vì schema không dùng @map; thiếu nháy là Postgres
// hạ chữ thường rồi báo không tìm thấy bảng, và lỗi đó chỉ rơi lúc chạy chứ tsc không bắt.
export function lockInventoryRows(
  tx: Prisma.TransactionClient,
  warehouseId: string,
  skuIds: string[]
) {
  return tx.$queryRaw<LockedInventoryRow[]>`
    SELECT id, "skuId", "quantityOnHand", "quantityReserved"
    FROM "Inventory"
    WHERE "warehouseId" = ${warehouseId}::uuid
      AND "skuId" IN (${Prisma.join(skuIds)})
    ORDER BY "skuId"
    FOR UPDATE
  `;
}

// Cập nhật tồn kho và ghi audit trong CÙNG transaction — rule cứng của dự án, không được tách.
//
// Caller tự kiểm điều kiện nghiệp vụ (đủ hàng chưa, âm không) TRƯỚC khi gọi, vì mỗi module một
// kiểu: reservation xét available, outbound xét cả onHand lẫn reserved, inbound không xét gì.
// Ở đây chỉ còn phần cơ học, và CHECK constraint dưới DB là lưới đỡ cuối nếu caller kiểm sót.
export async function applyInventoryDeltas(
  tx: Prisma.TransactionClient,
  rows: Map<string, LockedInventoryRow>,
  deltas: InventoryDelta[],
  meta: MovementMeta
): Promise<void> {
  const movements: Prisma.InventoryMovementCreateManyInput[] = [];

  for (const delta of deltas) {
    const row = rows.get(delta.skuId);
    if (!row) {
      throw new Error(`Dòng tồn của SKU ${delta.skuId} chưa được khoá trước khi cập nhật`);
    }

    const onHandDelta = delta.onHand ?? 0;
    const reservedDelta = delta.reserved ?? 0;

    await tx.inventory.update({
      where: { id: row.id },
      data: {
        ...(onHandDelta !== 0 ? { quantityOnHand: { increment: onHandDelta } } : {}),
        ...(reservedDelta !== 0 ? { quantityReserved: { increment: reservedDelta } } : {}),
        version: { increment: 1 },
      },
    });

    // before lấy từ dòng đã khoá ở bước lock, after tính ra — không đọc lại DB
    movements.push({
      inventoryId: row.id,
      createdByUserId: meta.createdByUserId,
      movementType: meta.movementType,
      referenceType: meta.referenceType,
      referenceId: meta.referenceId,
      onHandBefore: row.quantityOnHand,
      onHandAfter: row.quantityOnHand + onHandDelta,
      reservedBefore: row.quantityReserved,
      reservedAfter: row.quantityReserved + reservedDelta,
      note: meta.note ?? null,
    });
  }

  await tx.inventoryMovement.createMany({ data: movements });
}
