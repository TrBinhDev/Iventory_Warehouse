import type { Request, Response } from "express";
import { HttpStatus } from "../../constants/httpStatus.js";
import { sendSuccess } from "../../utils/response.util.js";
import * as categoryService from "./category.service.js";
import type { ListCategoriesQuery } from "./category.schema.js";

// Xử lý request tạo loại sản phẩm mới
export async function createCategory(req: Request, res: Response): Promise<void> {
  const category = await categoryService.createCategory(req.body);
  sendSuccess(res, HttpStatus.CREATED, category);
}

// Xử lý request lấy danh sách category (phân trang)
export async function listCategories(req: Request, res: Response): Promise<void> {
  const query = req.query as unknown as ListCategoriesQuery;
  const { items, total } = await categoryService.listCategories(query);
  sendSuccess(res, HttpStatus.OK, items, {
    page: query.page,
    limit: query.limit,
    total,
  });
}
