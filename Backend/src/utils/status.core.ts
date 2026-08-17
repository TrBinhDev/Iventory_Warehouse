import type {
  AdjustmentStatus,
  DocumentType,
  InboundStatus,
  OutboundStatus,
  Prisma,
  ReservationStatus,
  SalesOrderStatus,
  TransferStatus,
} from "@prisma/client";

// Dưới DB fromStatus/toStatus là String vì 6 module có 6 enum khác nhau, không gộp được.
// Map này dựng lại ràng buộc đó ở tầng type: mỗi DocumentType chỉ nhận đúng enum của nó,
// nên gõ sai tên trạng thái hay ghi nhầm trạng thái của module khác là tsc chặn ngay.
interface StatusByDocument {
  RESERVATION: ReservationStatus;
  SALES_ORDER: SalesOrderStatus;
  INBOUND: InboundStatus;
  OUTBOUND: OutboundStatus;
  TRANSFER: TransferStatus;
  INVENTORY_ADJUSTMENT: AdjustmentStatus;
}

export interface StatusChange<T extends DocumentType> {
  documentType: T;
  documentId: string;
  // null khi chứng từ vừa được tạo, chưa có trạng thái trước đó
  fromStatus: StatusByDocument[T] | null;
  toStatus: StatusByDocument[T];
  // null khi hệ thống tự chuyển (job hết hạn), không có người nào bấm
  changedByUserId: string | null;
  note?: string;
}

// Ghi 1 dòng lịch sử chuyển trạng thái chứng từ.
//
// ĐÂY LÀ LÝ DO FILE NÀY TỒN TẠI: mọi lệnh đổi status ở 6 module đều phải đi kèm 1 dòng ở đây,
// và phải nằm trong CÙNG transaction với lệnh đổi — tách ra thì có lúc phiếu đổi trạng thái
// xong mà lịch sử không ghi được, mất dấu người thao tác vĩnh viễn. Gói lại một chỗ để không
// module nào tự chế kiểu riêng, cùng vai trò inventory.core.ts gói ORDER BY "skuId".
export async function recordStatusChange<T extends DocumentType>(
  tx: Prisma.TransactionClient,
  change: StatusChange<T>
): Promise<void> {
  // Chuyển về chính nó là lỗi lập trình (caller quên kiểm trạng thái nguồn), không phải lỗi
  // người dùng — ném Error trần để lộ ra ngay lúc test thay vì đẻ rác lịch sử âm thầm.
  if (change.fromStatus === change.toStatus) {
    throw new Error(
      `Ghi lịch sử ${change.documentType} với fromStatus trùng toStatus (${change.toStatus})`
    );
  }

  await tx.documentStatusHistory.create({
    data: {
      documentType: change.documentType,
      documentId: change.documentId,
      fromStatus: change.fromStatus,
      toStatus: change.toStatus,
      changedByUserId: change.changedByUserId,
      note: change.note ?? null,
    },
  });
}
