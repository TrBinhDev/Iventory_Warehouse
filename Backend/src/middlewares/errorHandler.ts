import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { AppError } from "../errors/appError.js";
import { Message } from "../constants/message.js";
import { HttpStatus } from "../constants/httpStatus.js";
import { sendError } from "../utils/response.util.js";
import { logger } from "../config/logger.js";

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof AppError) {
    sendError(res, err.statusCode, err.code, err.message, err.details);
    return;
  }

  if (err instanceof ZodError) {
    const details = err.issues.map((issue) => ({
      field: issue.path.join("."),
      message: issue.message,
    }));
    sendError(
      res,
      HttpStatus.BAD_REQUEST,
      Message.COMMON.VALIDATION_ERROR.code,
      Message.COMMON.VALIDATION_ERROR.message,
      details
    );
    return;
  }

  logger.error(`Lỗi không xác định tại ${req.method} ${req.originalUrl}`, err);
  sendError(
    res,
    HttpStatus.INTERNAL_SERVER_ERROR,
    Message.COMMON.SERVER_ERROR.code,
    Message.COMMON.SERVER_ERROR.message
  );
}
