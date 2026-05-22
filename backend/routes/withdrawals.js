'use strict';

const express = require('express');
const asyncHandler = require('../middleware/async-handler');
const { requireAuth } = require('../middleware/auth');
const { requireModerator } = require('../middleware/admin');
const { withdrawalLimiter } = require('../middleware/rate-limit');
const { requestWithdrawal, reviewWithdrawal } = require('../services/withdrawal-service');

const router = express.Router();

router.post('/request', requireAuth, withdrawalLimiter, asyncHandler(async (req, res) => {
  const result = await requestWithdrawal(req.user.uid, req.user.token, req.body);
  res.json(result);
}));

router.post('/review', requireAuth, requireModerator, withdrawalLimiter, asyncHandler(async (req, res) => {
  const result = await reviewWithdrawal(req.user.uid, req.body);
  res.json(result);
}));

module.exports = router;
