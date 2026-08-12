import type { Request, Response } from "express";
import { HttpStatus } from "../../constants/httpStatus.js";
import { sendSuccess } from "../../utils/response.util.js";
import * as categoryService from "./category.service.js";

// Xử lý request tạo loại sản phẩm mới
export async function createCategory(req: Request, res: Response): Promise<void> {
  const category = await categoryService.createCategory(req.body);
  sendSuccess(res, HttpStatus.CREATED, category);
}
