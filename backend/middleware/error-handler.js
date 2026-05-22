'use strict';

const { AppError } = require('../utils/app-error');

function notFound(req, _res, next) {
  next(new AppError(404, 'not_found', `Route not found: ${req.method} ${req.originalUrl}`));
}

function errorHandler(error, req, res, _next) {
  const statusCode = error.statusCode || 500;
  const payload = {
    valid: false,
    error: {
      code: error.code || 'internal_error',
      message: statusCode >= 500 ? 'Internal server error.' : error.message
    }
  };

  if (process.env.NODE_ENV !== 'production') {
    payload.error.details = error.details || null;
    payload.error.stack = error.stack;
  }

  if (statusCode >= 500) {
    console.error('[backend:error]', {
      method: req.method,
      path: req.originalUrl,
      code: payload.error.code,
      message: error.message
    });
  }

  res.status(statusCode).json(payload);
}

module.exports = {
  notFound,
  errorHandler
};
