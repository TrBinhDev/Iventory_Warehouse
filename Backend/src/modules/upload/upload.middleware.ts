import type { NextFunction, Request, Response } from "express";
import multer from "multer";
import { BadRequestError } from "../../errors/appError.js";
import { Message } from "../../constants/message.js";

export const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB mỗi ảnh
export const MAX_FILE_COUNT = 10;
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

// Bọc multer để lỗi của nó ra đúng format JSend thay vì rơi vào nhánh 500 của errorHandler
export function uploadFiles(req: Request, res: Response, next: NextFunction): void {
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
    next(err);
  });
}
