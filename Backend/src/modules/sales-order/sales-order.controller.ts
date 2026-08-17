import type { Request, Response } from "express";
import { HttpStatus } from "../../constants/httpStatus.js";
import { Message } from "../../constants/message.js";
import { BadRequestError } from "../../errors/appError.js";
import { sendSuccess } from "../../utils/response.util.js";
import * as salesOrderService from "./sales-order.service.js";
import { idempotencyKeySchema } from "./sales-order.schema.js";
import type { ListSalesOrdersQuery, SalesOrderIdParam } from "./sales-order.schema.js";

// Đọc header Idempotency-Key — validate middleware chỉ nhận body/query/params nên đọc tay ở đây
function requireIdempotencyKey(req: Request): string {
  const parsed = idempotencyKeySchema.safeParse(req.header("Idempotency-Key"));

  if (!parsed.success) {
    throw new BadRequestError(
      Message.SALES_ORDER.MISSING_IDEMPOTENCY_KEY.message,
      Message.SALES_ORDER.MISSING_IDEMPOTENCY_KEY.code,
    );
  }

  return parsed.data;
}

// Xử lý request mua thẳng — khoá tồn và tăng reserved
export async function createSalesOrder(req: Request, res: Response): Promise<void> {
  const order = await salesOrderService.createSalesOrder(
    req.user!,
    req.body,
    requireIdempotencyKey(req),
  );

  sendSuccess(res, HttpStatus.CREATED, order);
}

// Xử lý request đặt mua từ phiếu giữ chỗ — không chạm tồn kho
export async function createSalesOrderFromReservation(
  req: Request,
  res: Response,
): Promise<void> {
  const order = await salesOrderService.createSalesOrderFromReservation(
    req.user!,
    req.body,
    requireIdempotencyKey(req),
  );

  sendSuccess(res, HttpStatus.CREATED, order);
}

// Xử lý request lấy danh sách đơn hàng (phân trang)
export async function listSalesOrders(req: Request, res: Response): Promise<void> {
  const query = req.query as unknown as ListSalesOrdersQuery;
  const { items, total } = await salesOrderService.listSalesOrders(req.user!, query);
  sendSuccess(res, HttpStatus.OK, items, {
    page: query.page,
    limit: query.limit,
    total,
  });
}

// Xử lý request xem chi tiết 1 đơn hàng
export async function getSalesOrderById(req: Request, res: Response): Promise<void> {
  const { id } = req.params as unknown as SalesOrderIdParam;
  const order = await salesOrderService.getSalesOrderById(req.user!, id);
  sendSuccess(res, HttpStatus.OK, order);
}

// Xử lý request xác nhận đã nhận tiền. Bắt buộc Idempotency-Key: hiện hơi thừa vì chốt
// WHERE status='PENDING' đã chặn bấm 2 lần, nhưng đúng chỗ cần khi webhook cổng thanh toán
// retry — và thêm sau khi frontend đã tích hợp thì là phá contract.
export async function payOrder(req: Request, res: Response): Promise<void> {
  const { id } = req.params as unknown as SalesOrderIdParam;
  const order = await salesOrderService.payOrder(req.user!, id, requireIdempotencyKey(req));
  sendSuccess(res, HttpStatus.OK, order);
}

// Xử lý request duyệt đơn đã thu tiền. Không cần Idempotency-Key: bước này không đụng tiền
// và không có bên thứ ba nào gọi lại.
export async function confirmOrder(req: Request, res: Response): Promise<void> {
  const { id } = req.params as unknown as SalesOrderIdParam;
  const order = await salesOrderService.confirmOrder(req.user!, id);
  sendSuccess(res, HttpStatus.OK, order);
}

// Xử lý request huỷ đơn — trả CANCELLED hoặc REFUNDED tuỳ đơn đã thu tiền chưa
export async function cancelSalesOrder(req: Request, res: Response): Promise<void> {
  const { id } = req.params as unknown as SalesOrderIdParam;
  const order = await salesOrderService.cancelSalesOrder(req.user!, id, req.body);
  sendSuccess(res, HttpStatus.OK, order);
}
