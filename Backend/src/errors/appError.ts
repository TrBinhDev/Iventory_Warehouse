import { HttpStatus } from "../constants/httpStatus.js";
import { Message } from "../constants/message.js";

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details: unknown;

  constructor(
    statusCode: number,
    code: string,
    message: string,
    details: unknown = null
  ) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class BadRequestError extends AppError {
  constructor(
    message: string = Message.COMMON.VALIDATION_ERROR.message,
    code: string = Message.COMMON.VALIDATION_ERROR.code,
    details: unknown = null
  ) {
    super(HttpStatus.BAD_REQUEST, code, message, details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(
    message: string = Message.COMMON.UNAUTHORIZED.message,
    code: string = Message.COMMON.UNAUTHORIZED.code,
    details: unknown = null
  ) {
    super(HttpStatus.UNAUTHORIZED, code, message, details);
  }
}

export class ForbiddenError extends AppError {
  constructor(
    message: string = Message.COMMON.FORBIDDEN.message,
    code: string = Message.COMMON.FORBIDDEN.code,
    details: unknown = null
  ) {
    super(HttpStatus.FORBIDDEN, code, message, details);
  }
}

export class NotFoundError extends AppError {
  constructor(
    message: string = Message.COMMON.NOT_FOUND.message,
    code: string = Message.COMMON.NOT_FOUND.code,
    details: unknown = null
  ) {
    super(HttpStatus.NOT_FOUND, code, message, details);
  }
}

export class ConflictError extends AppError {
  constructor(
    message: string = Message.COMMON.CONFLICT.message,
    code: string = Message.COMMON.CONFLICT.code,
    details: unknown = null
  ) {
    super(HttpStatus.CONFLICT, code, message, details);
  }
}
