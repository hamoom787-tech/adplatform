'use strict';

const morgan = require('morgan');

const requestLogger = morgan(process.env.NODE_ENV === 'production'
  ? 'combined'
  : ':method :url :status :response-time ms');

module.exports = requestLogger;
