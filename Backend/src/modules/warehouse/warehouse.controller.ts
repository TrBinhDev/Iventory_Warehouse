import type { Request, Response } from "express";
import { HttpStatus } from "../../constants/httpStatus.js";
import { sendSuccess } from "../../utils/response.util.js";
import * as warehouseService from "./warehouse.service.js";
import type { ListWarehousesQuery } from "./warehouse.schema.js";

// Xử lý request tạo kho mới
export async function createWarehouse(req: Request, res: Response): Promise<void> {
  const warehouse = await warehouseService.createWarehouse(req.body);
  sendSuccess(res, HttpStatus.CREATED, warehouse);
}

// Xử lý request lấy danh sách kho (phân trang, public)
export async function listWarehouses(req: Request, res: Response): Promise<void> {
  const query = req.query as unknown as ListWarehousesQuery;
  const { items, total } = await warehouseService.listWarehouses(query);
  sendSuccess(res, HttpStatus.OK, items, {
    page: query.page,
    limit: query.limit,
    total,
  });
}
