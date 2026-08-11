import type { Request, Response } from "express";
import { HttpStatus } from "../../constants/httpStatus.js";
import { sendSuccess } from "../../utils/response.util.js";
import * as authService from "./auth.service.js";

// Xử lý request đăng ký tài khoản Customer
export async function register(req: Request, res: Response): Promise<void> {
  const user = await authService.register(req.body);
  sendSuccess(res, HttpStatus.CREATED, user);
}
