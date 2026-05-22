'use strict';

const { auth } = require('../firebase-admin');
const { appError } = require('../utils/app-error');

async function requireAuth(req, _res, next) {
  try {
    const header = String(req.headers.authorization || '');
    const match = header.match(/^Bearer\s+(.+)$/i);
    if (!match) throw appError(401, 'missing_auth_token', 'Missing Firebase ID token.');
    const decoded = await auth.verifyIdToken(match[1], true);
    req.user = {
      uid: decoded.uid,
      token: decoded
    };
    next();
  } catch (error) {
    next(error.statusCode ? error : appError(401, 'invalid_auth_token', 'Invalid or expired Firebase ID token.'));
  }
}

module.exports = {
  requireAuth
};
