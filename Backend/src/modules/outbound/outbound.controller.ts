import type { Request, Response } from "express";
import { HttpStatus } from "../../constants/httpStatus.js";
import { sendSuccess } from "../../utils/response.util.js";
import * as outboundService from "./outbound.service.js";
import type { ListOutboundsQuery, OutboundIdParam } from "./outbound.schema.js";

// Xử lý request tạo phiếu xuất kho
export async function createOutbound(req: Request, res: Response): Promise<void> {
  const outbound = await outboundService.createOutbound(req.user!, req.body);
  sendSuccess(res, HttpStatus.CREATED, outbound);
}

// Xử lý request lấy danh sách phiếu xuất kho (phân trang)
export async function listOutbounds(req: Request, res: Response): Promise<void> {
  const query = req.query as unknown as ListOutboundsQuery;
  const { items, total } = await outboundService.listOutbounds(req.user!, query);
  sendSuccess(res, HttpStatus.OK, items, {
    page: query.page,
    limit: query.limit,
    total,
  });
}

// Xử lý request xem chi tiết 1 phiếu xuất kho
export async function getOutboundById(req: Request, res: Response): Promise<void> {
  const { id } = req.params as unknown as OutboundIdParam;
  const outbound = await outboundService.getOutboundById(req.user!, id);
  sendSuccess(res, HttpStatus.OK, outbound);
}

// Xử lý request duyệt phiếu xuất kho
export async function confirmOutbound(req: Request, res: Response): Promise<void> {
  const { id } = req.params as unknown as OutboundIdParam;
  const outbound = await outboundService.confirmOutbound(req.user!, id);
  sendSuccess(res, HttpStatus.OK, outbound);
}

// Xử lý request xuất hàng (bước duy nhất chạm Inventory)
export async function shipOutbound(req: Request, res: Response): Promise<void> {
  const { id } = req.params as unknown as OutboundIdParam;
  const outbound = await outboundService.shipOutbound(req.user!, id);
  sendSuccess(res, HttpStatus.OK, outbound);
}

// Xử lý request huỷ phiếu xuất kho
export async function cancelOutbound(req: Request, res: Response): Promise<void> {
  const { id } = req.params as unknown as OutboundIdParam;
  const outbound = await outboundService.cancelOutbound(req.user!, id, req.body);
  sendSuccess(res, HttpStatus.OK, outbound);
}
