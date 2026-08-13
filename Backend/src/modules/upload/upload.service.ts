import { randomUUID } from "crypto";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { r2, R2_BUCKET, buildPublicUrl } from "../../config/r2.js";
import { BadRequestError } from "../../errors/appError.js";
import { Message } from "../../constants/message.js";

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

