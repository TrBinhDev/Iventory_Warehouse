import type { Request, Response } from "express";
import { HttpStatus } from "../constants/httpStatus.js";
import { ErrorCode, ErrorMessage } from "../constants/message.js";
import { sendError } from "../utils/response.util.js";

export function notFoundHandler(req: Request, res: Response): void {
  sendError(
    res,
    HttpStatus.NOT_FOUND,
    ErrorCode.NOT_FOUND,
    `${ErrorMessage.NOT_FOUND}: ${req.method} ${req.originalUrl}`
  );
}
