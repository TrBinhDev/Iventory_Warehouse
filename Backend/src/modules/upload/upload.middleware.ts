import type { NextFunction, Request, Response } from "express";
import multer from "multer";
import { BadRequestError } from "../../errors/appError.js";
import { Message } from "../../constants/message.js";

export const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB mỗi ảnh
export const MAX_FILE_COUNT = 10;
export const MAX_TOTAL_SIZE = 25 * 1024 * 1024; // 25MB tổng cả request
export const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];

// Giữ file trong RAM rồi đẩy thẳng lên R2, không ghi tạm ra đĩa —
// ảnh nhỏ và server có thể chạy trên môi trường không có ổ ghi được
const multerUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE, files: MAX_FILE_COUNT },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      cb(new BadRequestError(Message.UPLOAD.INVALID_FILE_TYPE.message, Message.UPLOAD.INVALID_FILE_TYPE.code));
      return;
    }
    cb(null, true);
  },
}).array("files", MAX_FILE_COUNT);

// Bọc multer để lỗi của nó ra đúng format JSend thay vì rơi vào nhánh 500 của errorHandler.
// Multer chỉ giới hạn được từng file và số lượng file, không có giới hạn tổng — nên chặn tổng ở đây.
export function uploadFiles(req: Request, res: Response, next: NextFunction): void {
  // Chặn sớm theo Content-Length: từ chối TRƯỚC khi multer đọc body vào RAM.
  // Content-Length có tính cả phần khung multipart nên nhỉnh hơn tổng bytes ảnh một chút, chấp nhận được.
  const declaredSize = Number(req.headers["content-length"]);
  if (Number.isFinite(declaredSize) && declaredSize > MAX_TOTAL_SIZE) {
    next(new BadRequestError(Message.UPLOAD.TOTAL_TOO_LARGE.message, Message.UPLOAD.TOTAL_TOO_LARGE.code));
    return;
  }

  multerUpload(req, res, (err: unknown) => {
    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") {
        next(new BadRequestError(Message.UPLOAD.FILE_TOO_LARGE.message, Message.UPLOAD.FILE_TOO_LARGE.code));
        return;
      }
      if (err.code === "LIMIT_FILE_COUNT" || err.code === "LIMIT_UNEXPECTED_FILE") {
        next(new BadRequestError(Message.UPLOAD.TOO_MANY_FILES.message, Message.UPLOAD.TOO_MANY_FILES.code));
        return;
      }
    }
    if (err) {
      next(err);
      return;
    }

    // Lưới đỡ cho trường hợp client gửi chunked (không có Content-Length) nên bỏ lọt kiểm tra ở trên
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    const total = files.reduce((sum, file) => sum + file.size, 0);
    if (total > MAX_TOTAL_SIZE) {
      next(new BadRequestError(Message.UPLOAD.TOTAL_TOO_LARGE.message, Message.UPLOAD.TOTAL_TOO_LARGE.code));
      return;
    }

    next();
  });
}
