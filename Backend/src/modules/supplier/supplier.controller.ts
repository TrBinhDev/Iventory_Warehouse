import type { Request, Response } from "express";
import { HttpStatus } from "../../constants/httpStatus.js";
import { sendSuccess } from "../../utils/response.util.js";
import * as supplierService from "./supplier.service.js";

// Xử lý request tạo nhà cung cấp mới
export async function createSupplier(req: Request, res: Response): Promise<void> {
  const supplier = await supplierService.createSupplier(req.body);
  sendSuccess(res, HttpStatus.CREATED, supplier);
}
