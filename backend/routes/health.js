'use strict';

const express = require('express');
const router = express.Router();

router.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    ok: true,
    service: 'adplatform-render-backend',
    time: new Date().toISOString()
  });
});

router.get('/healthz', (_req, res) => {
  res.status(200).send('ok');
});

module.exports = router;
