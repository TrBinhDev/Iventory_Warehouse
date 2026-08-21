import type { Request, Response } from "express";
import { HttpStatus } from "../../constants/httpStatus.js";
import { sendSuccess } from "../../utils/response.util.js";
import * as transferService from "./transfer.service.js";
import type { ListTransfersQuery, TransferIdParam } from "./transfer.schema.js";

// Xử lý request tạo phiếu chuyển kho
export async function createTransfer(req: Request, res: Response): Promise<void> {
  const transfer = await transferService.createTransfer(req.user!, req.body);
  sendSuccess(res, HttpStatus.CREATED, transfer);
}

// Xử lý request lấy danh sách phiếu chuyển kho (phân trang)
export async function listTransfers(req: Request, res: Response): Promise<void> {
  const query = req.query as unknown as ListTransfersQuery;
  const { items, total } = await transferService.listTransfers(req.user!, query);
  sendSuccess(res, HttpStatus.OK, items, {
    page: query.page,
    limit: query.limit,
    total,
  });
}

// Xử lý request xem chi tiết 1 phiếu chuyển kho
export async function getTransferById(req: Request, res: Response): Promise<void> {
  const { id } = req.params as unknown as TransferIdParam;
  const transfer = await transferService.getTransferById(req.user!, id);
  sendSuccess(res, HttpStatus.OK, transfer);
}

// Xử lý request duyệt phiếu chuyển kho
export async function confirmTransfer(req: Request, res: Response): Promise<void> {
  const { id } = req.params as unknown as TransferIdParam;
  const transfer = await transferService.confirmTransfer(req.user!, id);
  sendSuccess(res, HttpStatus.OK, transfer);
}

// Xử lý request xuất hàng ở kho nguồn
export async function shipTransfer(req: Request, res: Response): Promise<void> {
  const { id } = req.params as unknown as TransferIdParam;
  const transfer = await transferService.shipTransfer(req.user!, id);
  sendSuccess(res, HttpStatus.OK, transfer);
}

// Xử lý request nhận hàng ở kho đích
export async function receiveTransfer(req: Request, res: Response): Promise<void> {
  const { id } = req.params as unknown as TransferIdParam;
  const transfer = await transferService.receiveTransfer(req.user!, id, req.body);
  sendSuccess(res, HttpStatus.OK, transfer);
}

// Xử lý request huỷ phiếu chuyển kho
export async function cancelTransfer(req: Request, res: Response): Promise<void> {
  const { id } = req.params as unknown as TransferIdParam;
  const transfer = await transferService.cancelTransfer(req.user!, id, req.body);
  sendSuccess(res, HttpStatus.OK, transfer);
}
