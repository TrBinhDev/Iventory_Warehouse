import type { Request, Response } from "express";
import { HttpStatus } from "../../constants/httpStatus.js";
import { sendSuccess } from "../../utils/response.util.js";
import * as inventoryService from "./inventory.service.js";
import type {
  AvailabilityQuery,
  InventoryIdParam,
  ListInventoriesQuery,
} from "./inventory.schema.js";

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

// Xử lý request public xem SKU còn hàng ở kho nào
export async function getAvailability(req: Request, res: Response): Promise<void> {
  const query = req.query as unknown as AvailabilityQuery;
  const availability = await inventoryService.getAvailability(query);
  sendSuccess(res, HttpStatus.OK, availability);
}

// Xử lý request xem chi tiết 1 dòng tồn kho
export async function getInventoryById(req: Request, res: Response): Promise<void> {
  const { id } = req.params as unknown as InventoryIdParam;
  const inventory = await inventoryService.getInventoryById(req.user!, id);
  sendSuccess(res, HttpStatus.OK, inventory);
}
