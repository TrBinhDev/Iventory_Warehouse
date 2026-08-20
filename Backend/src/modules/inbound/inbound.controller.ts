import type { Request, Response } from "express";
import { HttpStatus } from "../../constants/httpStatus.js";
import { sendSuccess } from "../../utils/response.util.js";
import * as inboundService from "./inbound.service.js";
import type { InboundIdParam, ListInboundsQuery } from "./inbound.schema.js";

// Xử lý request tạo phiếu nhập kho
export async function createInbound(req: Request, res: Response): Promise<void> {
  const inbound = await inboundService.createInbound(req.user!, req.body);
  sendSuccess(res, HttpStatus.CREATED, inbound);
}

// Xử lý request lấy danh sách phiếu nhập kho (phân trang)
export async function listInbounds(req: Request, res: Response): Promise<void> {
  const query = req.query as unknown as ListInboundsQuery;
  const { items, total } = await inboundService.listInbounds(req.user!, query);
  sendSuccess(res, HttpStatus.OK, items, {
    page: query.page,
    limit: query.limit,
    total,
  });
}

// Xử lý request xem chi tiết 1 phiếu nhập kho
export async function getInboundById(req: Request, res: Response): Promise<void> {
  const { id } = req.params as unknown as InboundIdParam;
  const inbound = await inboundService.getInboundById(req.user!, id);
  sendSuccess(res, HttpStatus.OK, inbound);
}

// Xử lý request duyệt phiếu nhập kho
export async function confirmInbound(req: Request, res: Response): Promise<void> {
  const { id } = req.params as unknown as InboundIdParam;
  const inbound = await inboundService.confirmInbound(req.user!, id);
  sendSuccess(res, HttpStatus.OK, inbound);
}

// Xử lý request nhận hàng (bước duy nhất chạm Inventory)
export async function receiveInbound(req: Request, res: Response): Promise<void> {
  const { id } = req.params as unknown as InboundIdParam;
  const inbound = await inboundService.receiveInbound(req.user!, id, req.body);
  sendSuccess(res, HttpStatus.OK, inbound);
}

// Xử lý request huỷ phiếu nhập kho
export async function cancelInbound(req: Request, res: Response): Promise<void> {
  const { id } = req.params as unknown as InboundIdParam;
  const inbound = await inboundService.cancelInbound(req.user!, id, req.body);
  sendSuccess(res, HttpStatus.OK, inbound);
}
