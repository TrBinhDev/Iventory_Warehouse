import type { Request, Response } from "express";
import { HttpStatus } from "../../constants/httpStatus.js";
import { sendSuccess } from "../../utils/response.util.js";
import * as inventoryService from "./inventory.service.js";
import type { ListInventoriesQuery } from "./inventory.schema.js";

// Xử lý request khởi tạo dòng tồn kho cho 1 cặp kho + SKU
export async function createInventory(req: Request, res: Response): Promise<void> {
  const inventory = await inventoryService.createInventory(req.user!, req.body);
  sendSuccess(res, HttpStatus.CREATED, inventory);
}

// Xử lý request lấy danh sách tồn kho (phân trang)
export async function listInventories(req: Request, res: Response): Promise<void> {
  const query = req.query as unknown as ListInventoriesQuery;
  const { items, total } = await inventoryService.listInventories(req.user!, query);
  sendSuccess(res, HttpStatus.OK, items, {
    page: query.page,
    limit: query.limit,
    total,
  });
}
