import type { Request, Response } from "express";
import { HttpStatus } from "../../constants/httpStatus.js";
import { sendSuccess } from "../../utils/response.util.js";
import * as supplierService from "./supplier.service.js";
import type { ListSuppliersQuery } from "./supplier.schema.js";

// Xử lý request tạo nhà cung cấp mới
export async function createSupplier(req: Request, res: Response): Promise<void> {
  const supplier = await supplierService.createSupplier(req.body);
  sendSuccess(res, HttpStatus.CREATED, supplier);
}

// Xử lý request lấy danh sách NCC (phân trang)
export async function listSuppliers(req: Request, res: Response): Promise<void> {
  const query = req.query as unknown as ListSuppliersQuery;
  const { items, total } = await supplierService.listSuppliers(query);
  sendSuccess(res, HttpStatus.OK, items, {
    page: query.page,
    limit: query.limit,
    total,
  });
}
