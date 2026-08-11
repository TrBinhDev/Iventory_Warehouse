import type { Request, Response } from "express";
import { HttpStatus } from "../../constants/httpStatus.js";
import { sendSuccess } from "../../utils/response.util.js";
import * as warehouseService from "./warehouse.service.js";

// Xử lý request tạo kho mới
export async function createWarehouse(req: Request, res: Response): Promise<void> {
  const warehouse = await warehouseService.createWarehouse(req.body);
  sendSuccess(res, HttpStatus.CREATED, warehouse);
}
