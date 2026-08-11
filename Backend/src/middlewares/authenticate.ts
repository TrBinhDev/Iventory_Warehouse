import type { NextFunction, Request, Response } from "express";
import { TokenExpiredError } from "jsonwebtoken";
import { UnauthorizedError } from "../errors/appError.js";
import { ErrorCode, ErrorMessage } from "../constants/message.js";
import { verifyAccessToken } from "../utils/jwt.util.js";

export function authenticate(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  const header = req.headers.authorization;

  if (!header?.startsWith("Bearer ")) {
    next(new UnauthorizedError(ErrorMessage.UNAUTHORIZED, ErrorCode.UNAUTHORIZED));
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
    if (err instanceof TokenExpiredError) {
      next(new UnauthorizedError(ErrorMessage.TOKEN_EXPIRED, ErrorCode.TOKEN_EXPIRED));
      return;
    }
    next(new UnauthorizedError(ErrorMessage.TOKEN_INVALID, ErrorCode.TOKEN_INVALID));
  }
}
