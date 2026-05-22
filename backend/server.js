'use strict';

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const requestLogger = require('./middleware/request-logger');
const { generalLimiter } = require('./middleware/rate-limit');
const { notFound, errorHandler } = require('./middleware/error-handler');

const healthRoutes = require('./routes/health');
const timewallRoutes = require('./routes/timewall');
const rewardRoutes = require('./routes/rewards');
const withdrawalRoutes = require('./routes/withdrawals');
const vastRoutes = require('./routes/vast');
const adminRoutes = require('./routes/admin');

const app = express();
const port = Number(process.env.PORT || 8080);
const defaultOrigins = 'https://adplatform-4d5a0.web.app,http://localhost:4173,http://127.0.0.1:4173,http://localhost:8080';
const origins = String([process.env.CORS_ORIGINS, process.env.FRONTEND_URL, defaultOrigins].filter(Boolean).join(','))
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);

app.disable('x-powered-by');
app.set('trust proxy', 1);

app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));

app.use(cors({
  origin(origin, callback) {
    if (!origin || origins.includes(origin)) return callback(null, true);
    return callback(new Error(`CORS blocked origin: ${origin}`));
  },
  credentials: false,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(requestLogger);
app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || '100kb' }));
app.use(generalLimiter);

app.use('/', healthRoutes);
app.use('/timewall', timewallRoutes);
app.use('/rewards', rewardRoutes);
app.use('/withdrawals', withdrawalRoutes);
app.use('/vast', vastRoutes);
app.use('/admin', adminRoutes);

app.use(notFound);
app.use(errorHandler);

if (require.main === module) {
  app.listen(port, () => {
    console.log(`AdPlatform Render backend listening on port ${port}`);
  });
}

module.exports = app;
