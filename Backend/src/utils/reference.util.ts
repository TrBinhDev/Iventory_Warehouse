import { ConflictError } from "../errors/appError.js";

// Một loại dữ liệu đang tham chiếu tới bản ghi sắp xoá.
// label là nhãn tiếng Việt để client hiển thị thẳng, không phải map lại.
export interface ReferenceCount {
  resource: string;
  label: string;
  count: number;
}

// Chặn xoá khi còn thứ khác tham chiếu tới.
//
// Gộp 2 bước dễ sai khi viết tay ở từng service: quên lọc count > 0 thì details đầy dòng
// "count: 0" vô nghĩa, quên kiểm rỗng thì chặn cả khi thực ra không vướng gì.
//
// Đây là lớp chặn để BÁO cho tử tế (409 + vướng gì, bao nhiêu). Lớp bảo đảm đúng đắn nằm ở
// ràng buộc RESTRICT dưới DB — nó bịt được khoảng trống giữa lúc đếm và lúc xoá mà kiểm tra
// ở tầng ứng dụng không bịt được.
export function assertNoReferences(
  references: ReferenceCount[],
  message: { code: string; message: string }
): void {
  const blockers = references.filter((item) => item.count > 0);
  if (blockers.length > 0) {
    throw new ConflictError(message.message, message.code, blockers);
  }
}
