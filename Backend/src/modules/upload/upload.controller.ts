import type { Request, Response } from "express";
import { HttpStatus } from "../../constants/httpStatus.js";
import { sendSuccess } from "../../utils/response.util.js";
import * as uploadService from "./upload.service.js";

// Xử lý request tải ảnh lên R2, trả về danh sách URL để client gắn vào sản phẩm/avatar
export async function uploadImages(req: Request, res: Response): Promise<void> {
  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  const uploaded = await uploadService.uploadImages(files);
  sendSuccess(res, HttpStatus.CREATED, uploaded);
}
