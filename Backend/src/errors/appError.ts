import { HttpStatus } from "../constants/httpStatus.js";
import { ErrorCode, ErrorMessage } from "../constants/message.js";

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
    message: string = ErrorMessage.VALIDATION_ERROR,
    code: string = ErrorCode.VALIDATION_ERROR,
    details: unknown = null
  ) {
    super(HttpStatus.BAD_REQUEST, code, message, details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(
    message: string = ErrorMessage.UNAUTHORIZED,
    code: string = ErrorCode.UNAUTHORIZED,
    details: unknown = null
  ) {
    super(HttpStatus.UNAUTHORIZED, code, message, details);
  }
}

export class ForbiddenError extends AppError {
  constructor(
    message: string = ErrorMessage.FORBIDDEN,
    code: string = ErrorCode.FORBIDDEN,
    details: unknown = null
  ) {
    super(HttpStatus.FORBIDDEN, code, message, details);
  }
}

export class NotFoundError extends AppError {
  constructor(
    message: string = ErrorMessage.NOT_FOUND,
    code: string = ErrorCode.NOT_FOUND,
    details: unknown = null
  ) {
    super(HttpStatus.NOT_FOUND, code, message, details);
  }
}

export class ConflictError extends AppError {
  constructor(
    message: string = ErrorMessage.CONFLICT,
    code: string = ErrorCode.CONFLICT,
    details: unknown = null
  ) {
    super(HttpStatus.CONFLICT, code, message, details);
  }
}
