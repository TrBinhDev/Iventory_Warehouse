import type { Request, Response } from "express";
import { HttpStatus } from "../../constants/httpStatus.js";
import { sendSuccess } from "../../utils/response.util.js";
import * as warehouseService from "./warehouse.service.js";
import type { ListWarehousesQuery, WarehouseIdParam } from "./warehouse.schema.js";

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

// Xử lý request xem chi tiết 1 kho
export async function getWarehouseById(req: Request, res: Response): Promise<void> {
  const { id } = req.params as unknown as WarehouseIdParam;
  const warehouse = await warehouseService.getWarehouseById(id);
  sendSuccess(res, HttpStatus.OK, warehouse);
}

// Xử lý request sửa kho
export async function updateWarehouse(req: Request, res: Response): Promise<void> {
  const { id } = req.params as unknown as WarehouseIdParam;
  const warehouse = await warehouseService.updateWarehouse(id, req.body);
  sendSuccess(res, HttpStatus.OK, warehouse);
}
