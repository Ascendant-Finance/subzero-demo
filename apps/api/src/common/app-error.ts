import { ERROR_CODES, ERROR_STATUS, type ErrorCode } from '@trello-clone/shared';

/** The single error type the whole API throws. Maps to the section 6.6 shape. */
export class AppError extends Error {
  constructor(
    readonly code: ErrorCode,
    message?: string,
  ) {
    super(message ?? code);
    this.name = 'AppError';
  }

  get status(): number {
    return ERROR_STATUS[this.code];
  }

  static unauthenticated(message = 'Missing or invalid access token') {
    return new AppError(ERROR_CODES.UNAUTHENTICATED, message);
  }
  static tokenExpired(message = 'Access token expired') {
    return new AppError(ERROR_CODES.TOKEN_EXPIRED, message);
  }
  static forbidden(message = 'Not permitted') {
    return new AppError(ERROR_CODES.FORBIDDEN, message);
  }
  static notFound(message = 'Not found') {
    return new AppError(ERROR_CODES.NOT_FOUND, message);
  }
  static validation(message = 'Validation failed') {
    return new AppError(ERROR_CODES.VALIDATION_FAILED, message);
  }
  static conflict(message = 'Conflict') {
    return new AppError(ERROR_CODES.CONFLICT, message);
  }
  static uploadTooLarge(message = 'Attachment over the size cap') {
    return new AppError(ERROR_CODES.UPLOAD_TOO_LARGE, message);
  }
  static internal(message = 'Unexpected error') {
    return new AppError(ERROR_CODES.INTERNAL, message);
  }
}
