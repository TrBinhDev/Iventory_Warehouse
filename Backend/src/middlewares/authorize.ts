import type { NextFunction, Request, Response } from "express";
import type { UserRole } from "@prisma/client";
import { ForbiddenError } from "../errors/appError.js";
import { Message } from "../constants/message.js";

export function authorize(...allowedRoles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      next(new ForbiddenError(Message.COMMON.FORBIDDEN.message, Message.COMMON.FORBIDDEN.code));
      return;
    }
    next();
  };
}
