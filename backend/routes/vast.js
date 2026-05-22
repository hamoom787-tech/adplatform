'use strict';

const express = require('express');
const asyncHandler = require('../middleware/async-handler');
const { proxyVast } = require('../services/vast-service');

const router = express.Router();

router.get('/proxy', asyncHandler(async (req, res) => {
  const result = await proxyVast(req.query.url);
  res.set('Content-Type', 'application/xml; charset=utf-8');
  res.set('Cache-Control', result.cached ? 'public, max-age=300' : 'public, max-age=120');
  res.send(result.xml);
}));

module.exports = router;
