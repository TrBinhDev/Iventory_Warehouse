import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { UnauthorizedError } from "../errors/appError.js";
import { Message } from "../constants/message.js";
import { verifyAccessToken } from "../utils/jwt.util.js";

export function authenticate(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  const header = req.headers.authorization;

  if (!header?.startsWith("Bearer ")) {
    next(new UnauthorizedError(Message.COMMON.UNAUTHORIZED.message, Message.COMMON.UNAUTHORIZED.code));
    return;
  }

  const token = header.slice("Bearer ".length);

  try {
    const payload = verifyAccessToken(token);
    req.user = {
      id: payload.sub,
      role: payload.role,
      warehouseId: payload.warehouseId,
    };
    next();
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      next(new UnauthorizedError(Message.COMMON.TOKEN_EXPIRED.message, Message.COMMON.TOKEN_EXPIRED.code));
      return;
    }
    next(new UnauthorizedError(Message.COMMON.TOKEN_INVALID.message, Message.COMMON.TOKEN_INVALID.code));
  }
}
