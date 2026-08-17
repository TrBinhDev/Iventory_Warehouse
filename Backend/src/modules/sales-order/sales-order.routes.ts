import { Router } from "express";
import { authenticate } from "../../middlewares/authenticate.js";
import { authorize } from "../../middlewares/authorize.js";
import { validate } from "../../middlewares/validate.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import {
  cancelSalesOrderSchema,
  createFromReservationSchema,
  createSalesOrderSchema,
  listSalesOrdersQuerySchema,
  salesOrderIdParamSchema,
} from "./sales-order.schema.js";
import * as salesOrderController from "./sales-order.controller.js";

const router = Router();

// Chỉ CUSTOMER — nhân viên không đặt hộ, customerId lấy từ token
router.post(
  "/",
  authenticate,
  authorize("CUSTOMER"),
  validate(createSalesOrderSchema, "body"),
  asyncHandler(salesOrderController.createSalesOrder),
);

// Đường thứ hai để tạo đơn, tách hẳn khỏi route trên thay vì rẽ nhánh trong 1 body:
// gộp thì client gửi được body vừa có reservationId vừa có items và server phải đoán ý.
router.post(
  "/from-reservation",
  authenticate,
  authorize("CUSTOMER"),
  validate(createFromReservationSchema, "body"),
  asyncHandler(salesOrderController.createSalesOrderFromReservation),
);

// Cả 4 role đều xem được, phạm vi do service ép: khách thấy đơn của mình, nhân viên thấy kho mình
router.get(
  "/",
  authenticate,
  authorize("CUSTOMER", "WAREHOUSE_STAFF", "WAREHOUSE_MANAGER", "ADMIN"),
  validate(listSalesOrdersQuerySchema, "query"),
  asyncHandler(salesOrderController.listSalesOrders),
);

router.get(
  "/:id",
  authenticate,
  authorize("CUSTOMER", "WAREHOUSE_STAFF", "WAREHOUSE_MANAGER", "ADMIN"),
  validate(salesOrderIdParamSchema, "params"),
  asyncHandler(salesOrderController.getSalesOrderById),
);

// Chỉ Manager/Admin: đây là thao tác DUY NHẤT trong hệ thống đụng tiền, và không có đường lùi
// (enum không có PAID -> PENDING), bấm nhầm là phải huỷ/hoàn — mà cả hai cũng đều Manager.
router.patch(
  "/:id/pay",
  authenticate,
  authorize("WAREHOUSE_MANAGER", "ADMIN"),
  validate(salesOrderIdParamSchema, "params"),
  asyncHandler(salesOrderController.payOrder),
);

// STAFF không được huỷ — cùng lý do với reservation: nới quyền sau thì dễ, thu lại thì khó.
// Khách chỉ huỷ được đơn còn PENDING, ranh giới đó service ép chứ route không biết.
router.patch(
  "/:id/cancel",
  authenticate,
  authorize("CUSTOMER", "WAREHOUSE_MANAGER", "ADMIN"),
  validate(salesOrderIdParamSchema, "params"),
  validate(cancelSalesOrderSchema, "body"),
  asyncHandler(salesOrderController.cancelSalesOrder),
);

export { router as salesOrderRouter };
