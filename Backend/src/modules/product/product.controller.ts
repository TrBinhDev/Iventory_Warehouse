import type { Request, Response } from "express";
import { HttpStatus } from "../../constants/httpStatus.js";
import { sendSuccess } from "../../utils/response.util.js";
import * as productService from "./product.service.js";

// Xử lý request tạo sản phẩm mới
export async function createProduct(req: Request, res: Response): Promise<void> {
  const product = await productService.createProduct(req.body);
  sendSuccess(res, HttpStatus.CREATED, product);
}
