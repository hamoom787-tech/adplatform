'use strict';

const express = require('express');
const asyncHandler = require('../middleware/async-handler');
const { requireAuth } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/admin');
const { setUserClaims } = require('../services/admin-service');

const router = express.Router();

router.post('/set-claims', requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  const result = await setUserClaims(req.user.uid, req.body);
  res.json(result);
}));

module.exports = router;
