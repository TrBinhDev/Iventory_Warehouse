import type { Request, Response } from "express";
import { HttpStatus } from "../../constants/httpStatus.js";
import { sendSuccess } from "../../utils/response.util.js";
import * as userService from "./user.service.js";
import type { ListUsersQuery, UserIdParam } from "./user.schema.js";

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

// Xử lý request xem chi tiết 1 tài khoản
export async function getUserById(req: Request, res: Response): Promise<void> {
  const { id } = req.params as unknown as UserIdParam;
  const user = await userService.getUserById(req.user!, id);
  sendSuccess(res, HttpStatus.OK, user);
}
