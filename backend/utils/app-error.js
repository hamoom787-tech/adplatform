'use strict';

class AppError extends Error {
  constructor(statusCode, code, message, details = null) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

function appError(statusCode, code, message, details = null) {
  return new AppError(statusCode, code, message, details);
}

module.exports = {
  AppError,
  appError
};
