import type { NextFunction, Request, Response } from "express";
import type { ZodType } from "zod";
import { BadRequestError } from "../errors/appError.js";
import { Message } from "../constants/message.js";

type Source = "body" | "query" | "params";

export function validate(schema: ZodType, source: Source = "body") {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[source]);

    if (!result.success) {
      const details = result.error.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
      }));
      next(
        new BadRequestError(
          Message.COMMON.VALIDATION_ERROR.message,
          Message.COMMON.VALIDATION_ERROR.code,
          details
        )
      );
      return;
    }

    // req.query ở Express 5 chỉ có getter, không gán trực tiếp được như body/params
    if (source === "query") {
      Object.defineProperty(req, "query", {
        value: result.data,
        writable: true,
        configurable: true,
      });
    } else {
      req[source] = result.data;
    }

    next();
  };
}
