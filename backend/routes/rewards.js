'use strict';

const express = require('express');
const asyncHandler = require('../middleware/async-handler');
const { requireAuth } = require('../middleware/auth');
const { rewardLimiter } = require('../middleware/rate-limit');
const { startSession, claimReward } = require('../services/reward-service');

const router = express.Router();

router.post('/start-session', requireAuth, rewardLimiter, asyncHandler(async (req, res) => {
  const result = await startSession(req.user.uid, req.body);
  res.json(result);
}));

router.post('/claim', requireAuth, rewardLimiter, asyncHandler(async (req, res) => {
  const result = await claimReward(req.user.uid, req.body);
  res.json(result);
}));

module.exports = router;
