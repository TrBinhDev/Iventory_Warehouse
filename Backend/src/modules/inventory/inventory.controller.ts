import type { Request, Response } from "express";
import { HttpStatus } from "../../constants/httpStatus.js";
import { sendSuccess } from "../../utils/response.util.js";
import * as inventoryService from "./inventory.service.js";

// Xử lý request khởi tạo dòng tồn kho cho 1 cặp kho + SKU
export async function createInventory(req: Request, res: Response): Promise<void> {
  const inventory = await inventoryService.createInventory(req.user!, req.body);
  sendSuccess(res, HttpStatus.CREATED, inventory);
}
