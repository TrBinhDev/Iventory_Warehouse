import type { Request, Response } from "express";
import { HttpStatus } from "../../constants/httpStatus.js";
import { sendSuccess } from "../../utils/response.util.js";
import * as productService from "./product.service.js";
import type { ListProductsQuery } from "./product.schema.js";

// Xử lý request tạo sản phẩm mới
export async function createProduct(req: Request, res: Response): Promise<void> {
  const product = await productService.createProduct(req.body);
  sendSuccess(res, HttpStatus.CREATED, product);
}

// Xử lý request lấy danh sách sản phẩm (phân trang)
export async function listProducts(req: Request, res: Response): Promise<void> {
  const query = req.query as unknown as ListProductsQuery;
  const { items, total } = await productService.listProducts(query);
  sendSuccess(res, HttpStatus.OK, items, {
    page: query.page,
    limit: query.limit,
    total,
  });
}
