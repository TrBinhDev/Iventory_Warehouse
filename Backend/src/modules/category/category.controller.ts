import type { Request, Response } from "express";
import { HttpStatus } from "../../constants/httpStatus.js";
import { sendSuccess } from "../../utils/response.util.js";
import * as categoryService from "./category.service.js";
import type { ListCategoriesQuery, CategoryIdParam } from "./category.schema.js";

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

// Xử lý request xem chi tiết 1 category
export async function getCategoryById(req: Request, res: Response): Promise<void> {
  const { id } = req.params as unknown as CategoryIdParam;
  const category = await categoryService.getCategoryById(id);
  sendSuccess(res, HttpStatus.OK, category);
}

// Xử lý request sửa category
export async function updateCategory(req: Request, res: Response): Promise<void> {
  const { id } = req.params as unknown as CategoryIdParam;
  const category = await categoryService.updateCategory(id, req.body);
  sendSuccess(res, HttpStatus.OK, category);
}

// Xử lý request xoá category
// Trả 200 kèm { id } thay vì 204 rỗng: giữ đúng format JSend của dự án để frontend
// check success đồng nhất ở mọi endpoint, đồng thời xác nhận rõ đã xoá bản ghi nào
export async function deleteCategory(req: Request, res: Response): Promise<void> {
  const { id } = req.params as unknown as CategoryIdParam;
  await categoryService.deleteCategory(id);
  sendSuccess(res, HttpStatus.OK, { id });
}
