import type { Request, Response } from "express";
import { HttpStatus } from "../../constants/httpStatus.js";
import { sendSuccess } from "../../utils/response.util.js";
import * as userService from "./user.service.js";

// Xử lý request tạo tài khoản Admin/Manager/Staff
export async function createUser(req: Request, res: Response): Promise<void> {
  const user = await userService.createUser(req.user!, req.body);
  sendSuccess(res, HttpStatus.CREATED, user);
}
