'use strict';

const { appError } = require('../utils/app-error');

function requireAdmin(req, _res, next) {
  const token = req.user && req.user.token;
  if (token && token.admin === true) return next();
  return next(appError(403, 'admin_required', 'Admin custom claim is required.'));
}

function requireModerator(req, _res, next) {
  const token = req.user && req.user.token;
  if (token && (token.admin === true || token.moderator === true)) return next();
  return next(appError(403, 'moderator_required', 'Moderator custom claim is required.'));
}

module.exports = {
  requireAdmin,
  requireModerator
};
