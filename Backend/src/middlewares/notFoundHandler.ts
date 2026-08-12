import type { Request, Response } from "express";
import { HttpStatus } from "../constants/httpStatus.js";
import { Message } from "../constants/message.js";
import { sendError } from "../utils/response.util.js";

export function notFoundHandler(req: Request, res: Response): void {
  sendError(
    res,
    HttpStatus.NOT_FOUND,
    Message.COMMON.NOT_FOUND.code,
    `${Message.COMMON.NOT_FOUND.message}: ${req.method} ${req.originalUrl}`
  );
}
