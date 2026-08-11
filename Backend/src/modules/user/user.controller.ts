import type { Request, Response } from "express";
import { HttpStatus } from "../../constants/httpStatus.js";
import { sendSuccess } from "../../utils/response.util.js";
import * as userService from "./user.service.js";
import type { ListUsersQuery } from "./user.schema.js";

// Xử lý request tạo tài khoản Admin/Manager/Staff
export async function createUser(req: Request, res: Response): Promise<void> {
  const user = await userService.createUser(req.user!, req.body);
  sendSuccess(res, HttpStatus.CREATED, user);
}

// Xử lý request lấy danh sách tài khoản (phân trang)
export async function listUsers(req: Request, res: Response): Promise<void> {
  const query = req.query as unknown as ListUsersQuery;
  const { items, total } = await userService.listUsers(req.user!, query);
  sendSuccess(res, HttpStatus.OK, items, {
    page: query.page,
    limit: query.limit,
    total,
  });
}
