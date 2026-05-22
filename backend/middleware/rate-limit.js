'use strict';

const rateLimit = require('express-rate-limit');

function createLimiter(max, windowMs, message) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      valid: false,
      error: {
        code: 'rate_limited',
        message
      }
    }
  });
}

const windowMs = Number(process.env.GENERAL_RATE_LIMIT_WINDOW_MS || 60000);

const generalLimiter = createLimiter(
  Number(process.env.GENERAL_RATE_LIMIT_MAX || 120),
  windowMs,
  'Too many requests.'
);

const rewardLimiter = createLimiter(
  Number(process.env.REWARD_RATE_LIMIT_MAX || 30),
  windowMs,
  'Too many reward requests.'
);

const withdrawalLimiter = createLimiter(
  Number(process.env.WITHDRAWAL_RATE_LIMIT_MAX || 10),
  windowMs,
  'Too many withdrawal requests.'
);

const postbackLimiter = createLimiter(300, windowMs, 'Too many postback requests.');

module.exports = {
  generalLimiter,
  rewardLimiter,
  withdrawalLimiter,
  postbackLimiter
};
