import type { Request, Response } from "express";
import { HttpStatus } from "../../constants/httpStatus.js";
import { sendSuccess } from "../../utils/response.util.js";
import * as adjustmentService from "./adjustment.service.js";
import type { AdjustmentIdParam, ListAdjustmentsQuery } from "./adjustment.schema.js";

// Xử lý request mở phiếu kiểm kê
export async function createAdjustment(req: Request, res: Response): Promise<void> {
  const adjustment = await adjustmentService.createAdjustment(req.user!, req.body);
  sendSuccess(res, HttpStatus.CREATED, adjustment);
}

// Xử lý request lấy danh sách phiếu điều chỉnh (phân trang)
export async function listAdjustments(req: Request, res: Response): Promise<void> {
  const query = req.query as unknown as ListAdjustmentsQuery;
  const { items, total } = await adjustmentService.listAdjustments(req.user!, query);
  sendSuccess(res, HttpStatus.OK, items, {
    page: query.page,
    limit: query.limit,
    total,
  });
}

// Xử lý request xem chi tiết 1 phiếu điều chỉnh
export async function getAdjustmentById(req: Request, res: Response): Promise<void> {
  const { id } = req.params as unknown as AdjustmentIdParam;
  const adjustment = await adjustmentService.getAdjustmentById(req.user!, id);
  sendSuccess(res, HttpStatus.OK, adjustment);
}

// Xử lý request hoàn tất kiểm kê (bước duy nhất chạm Inventory, khoá optimistic)
export async function completeAdjustment(req: Request, res: Response): Promise<void> {
  const { id } = req.params as unknown as AdjustmentIdParam;
  const adjustment = await adjustmentService.completeAdjustment(req.user!, id);
  sendSuccess(res, HttpStatus.OK, adjustment);
}

// Xử lý request xoá phiếu còn DRAFT
export async function deleteAdjustment(req: Request, res: Response): Promise<void> {
  const { id } = req.params as unknown as AdjustmentIdParam;
  await adjustmentService.deleteAdjustment(req.user!, id);
  sendSuccess(res, HttpStatus.OK, { id });
}
