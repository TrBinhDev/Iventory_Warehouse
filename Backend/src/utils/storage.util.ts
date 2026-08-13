import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { r2, R2_BUCKET, extractKeyFromUrl } from "../config/r2.js";
import { logger } from "../config/logger.js";

// Xoá file khỏi R2 theo URL đã lưu trong DB — best-effort, KHÔNG BAO GIỜ throw.
//
// Luôn gọi SAU khi cập nhật DB thành công. Không gộp được vào transaction vì R2 nằm ngoài
// Postgres, nên phải chọn hướng hỏng ít hại nhất: DB xong mà xoá hụt thì chỉ còn file thừa
// nằm im (vô hại); làm ngược lại thì file mất trong khi DB vẫn trỏ tới, ảnh vỡ.
// Vì thao tác đã thành công về mặt nghiệp vụ nên lỗi xoá chỉ ghi log, không làm hỏng response.
export async function deleteFilesByUrls(urls: string[]): Promise<void> {
  await Promise.all(
    urls.map(async (url) => {
      // URL không thuộc bucket của mình (VD ảnh dán link ngoài vào) thì bỏ qua
      const key = extractKeyFromUrl(url);
      if (!key) return;

      try {
        await r2.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: key }));
      } catch (error) {
        logger.error(`Không xoá được file trên R2: ${key}`, error);
      }
    })
  );
}

// Tìm những URL có trong danh sách cũ nhưng không còn trong danh sách mới —
// dùng để biết ảnh nào vừa bị người dùng gỡ khỏi sản phẩm
export function findRemovedUrls(oldUrls: string[], newUrls: string[]): string[] {
  const kept = new Set(newUrls);
  return oldUrls.filter((url) => !kept.has(url));
}
