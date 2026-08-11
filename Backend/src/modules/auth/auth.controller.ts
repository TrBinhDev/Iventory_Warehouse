import type { Request, Response } from "express";
import { HttpStatus } from "../../constants/httpStatus.js";
import { sendSuccess } from "../../utils/response.util.js";
import { env } from "../../config/env.js";
import {
  REFRESH_TOKEN_COOKIE_NAME,
  JWT_REFRESH_EXPIRES_IN_SECONDS,
} from "../../constants/jwt.js";
import * as authService from "./auth.service.js";

// Gắn refresh token vào cookie httpOnly, chỉ gửi kèm request tới /auth/*
function setRefreshTokenCookie(res: Response, token: string): void {
  res.cookie(REFRESH_TOKEN_COOKIE_NAME, token, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/auth",
    maxAge: JWT_REFRESH_EXPIRES_IN_SECONDS * 1000,
  });
}

// Xử lý request đăng ký tài khoản Customer
export async function register(req: Request, res: Response): Promise<void> {
  const user = await authService.register(req.body);
  sendSuccess(res, HttpStatus.CREATED, user);
}

// Xử lý request đăng nhập: trả access token trong body, set refresh token qua cookie
export async function login(req: Request, res: Response): Promise<void> {
  const { accessToken, refreshToken, user } = await authService.login(req.body, {
    userAgent: req.headers["user-agent"],
    ip: req.ip,
  });

  setRefreshTokenCookie(res, refreshToken);
  sendSuccess(res, HttpStatus.OK, { accessToken, user });
}

// Xử lý request refresh: đọc refresh token từ cookie, cấp cặp token mới, rotate cookie
export async function refresh(req: Request, res: Response): Promise<void> {
  const currentRefreshToken = req.cookies?.[REFRESH_TOKEN_COOKIE_NAME] as
    | string
    | undefined;

  const { accessToken, refreshToken, user } = await authService.refresh(
    currentRefreshToken,
    {
      userAgent: req.headers["user-agent"],
      ip: req.ip,
    }
  );

  setRefreshTokenCookie(res, refreshToken);
  sendSuccess(res, HttpStatus.OK, { accessToken, user });
}

// Xử lý request đăng xuất: xoá session Redis + clear cookie
export async function logout(req: Request, res: Response): Promise<void> {
  await authService.logout(req.user!.id);
  res.clearCookie(REFRESH_TOKEN_COOKIE_NAME, { path: "/auth" });
  sendSuccess(res, HttpStatus.OK, null);
}

// Xử lý request lấy thông tin tài khoản hiện tại
export async function me(req: Request, res: Response): Promise<void> {
  const user = await authService.getMe(req.user!.id);
  sendSuccess(res, HttpStatus.OK, user);
}

// Xử lý request xác thực email bằng mã OTP
export async function verifyEmail(req: Request, res: Response): Promise<void> {
  const user = await authService.verifyEmail(req.body);
  sendSuccess(res, HttpStatus.OK, user);
}

// Xử lý request gửi lại mã OTP xác thực email
export async function resendVerification(req: Request, res: Response): Promise<void> {
  await authService.resendVerification(req.body);
  sendSuccess(res, HttpStatus.OK, { message: "Đã gửi lại mã xác thực" });
}

// Xử lý request quên mật khẩu — luôn trả response generic, không lộ email có tồn tại hay không
export async function forgotPassword(req: Request, res: Response): Promise<void> {
  await authService.forgotPassword(req.body.email);
  sendSuccess(res, HttpStatus.OK, {
    message: "Nếu email tồn tại trong hệ thống, link đặt lại mật khẩu đã được gửi",
  });
}
