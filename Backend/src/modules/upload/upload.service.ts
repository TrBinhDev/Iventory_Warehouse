import { randomUUID } from "crypto";
import { DeleteObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { r2, R2_BUCKET, buildPublicUrl, extractKeyFromUrl } from "../../config/r2.js";
import { BadRequestError } from "../../errors/appError.js";
import { Message } from "../../constants/message.js";
import { logger } from "../../config/logger.js";

const EXTENSION_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

// Tên file do người dùng đặt không dùng lại được (dễ trùng, dễ chứa ký tự lạ / path traversal)
// nên sinh key ngẫu nhiên, chia theo năm/tháng cho dễ soi thủ công trên dashboard R2
function buildKey(mimetype: string): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const extension = EXTENSION_BY_MIME[mimetype] ?? "bin";
  return `uploads/${year}/${month}/${randomUUID()}.${extension}`;
}

// Đẩy nhiều ảnh lên R2, trả về danh sách URL công khai để client gắn vào Product.images / User.avatarUrl
export async function uploadImages(files: Express.Multer.File[]) {
  if (files.length === 0) {
    throw new BadRequestError(Message.UPLOAD.NO_FILE.message, Message.UPLOAD.NO_FILE.code);
  }

  const uploaded = await Promise.all(
    files.map(async (file) => {
      const key = buildKey(file.mimetype);
      await r2.send(
        new PutObjectCommand({
          Bucket: R2_BUCKET,
          Key: key,
          Body: file.buffer,
          ContentType: file.mimetype,
        })
      );
      return { url: buildPublicUrl(key), size: file.size, mimetype: file.mimetype };
    })
  );

  return uploaded;
}

// Xoá file khỏi R2 theo URL đã lưu trong DB — best-effort.
// KHÔNG throw: lúc gọi hàm này thì DB đã cập nhật xong, xoá hụt chỉ để lại file thừa vô hại,
// còn ném lỗi ra sẽ làm hỏng response của một thao tác thực chất đã thành công.
export async function deleteByUrls(urls: string[]): Promise<void> {
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
