import type { Response } from "express";

interface Meta {
  page?: number;
  limit?: number;
  total?: number;
}

export function sendSuccess<T>(
  res: Response,
  statusCode: number,
  data: T,
  meta?: Meta
): void {
  res.status(statusCode).json({
    success: true,
    data,
    ...(meta ? { meta } : {}),
  });
}

export function sendError(
  res: Response,
  statusCode: number,
  code: string,
  message: string,
  details: unknown = null
): void {
  res.status(statusCode).json({
    success: false,
    error: { code, message, details },
  });
}
