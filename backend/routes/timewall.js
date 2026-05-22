'use strict';

const express = require('express');
const asyncHandler = require('../middleware/async-handler');
const { postbackLimiter } = require('../middleware/rate-limit');
const { appError } = require('../utils/app-error');
const { getClientIp, splitCsv } = require('../utils/validators');
const { processPostback } = require('../services/timewall-service');
const { securityIncident } = require('../services/log-service');

const router = express.Router();

function ipAllowed(ip) {
  if (String(process.env.TIMEWALL_IP_CHECK || 'true').toLowerCase() === 'false') return true;
  const whitelist = splitCsv(process.env.TIMEWALL_IP_WHITELIST || '51.81.120.73,142.111.248.18');
  return whitelist.includes(ip);
}

router.get('/postback', postbackLimiter, asyncHandler(async (req, res) => {
  const ip = getClientIp(req);
  if (!ipAllowed(ip)) {
    await securityIncident('timewall_ip_blocked', { ip, query: req.query }, 'high');
    throw appError(403, 'timewall_ip_blocked', 'TimeWall IP is not allowed.');
  }

  const result = await processPostback(req.query, { ip });
  res.status(200).send(result.duplicate ? 'DUPLICATE_OK' : 'OK');
}));

module.exports = router;
