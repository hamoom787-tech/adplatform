'use strict';

const { appError } = require('./app-error');

function asNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function money(value) {
  return Math.round(asNumber(value) * 100) / 100;
}

function cleanId(value) {
  return String(value || '').trim().replace(/[^\w.@:-]/g, '_').slice(0, 180);
}

function lower(value) {
  return String(value || '').trim().toLowerCase();
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw appError(500, 'missing_env', `${name} is required.`);
  return value;
}

function splitCsv(value) {
  return String(value || '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
}

function normalizePostbackType(type, currencyAmount = 0) {
  const value = lower(type || 'credit');
  if (money(currencyAmount) < 0 && !['pending', 'hold_cancelled'].includes(value)) return 'reversal';
  if (['credit', 'pending', 'hold_cancelled'].includes(value)) return value;
  if (['refund', 'reversal', 'chargeback'].includes(value)) return 'reversal';
  return value;
}

function validateWithdrawMethod(methodKey, accountValue) {
  const key = lower(methodKey);
  const account = String(accountValue || '').trim();
  const phoneRegex = /^01[0125][0-9]{8}$/;
  const instapayRegex = /^[a-zA-Z0-9._-]{3,60}@(instapay|ipn)$/i;
  const allowed = {
    vodafone_cash: 'Vodafone Cash',
    orange_cash: 'Orange Cash',
    etisalat_cash: 'Etisalat Cash',
    we_cash: 'WE Pay / WE Cash',
    instapay: 'InstaPay'
  };

  if (!allowed[key]) throw appError(400, 'invalid_withdraw_method', 'Unsupported withdrawal method.');
  if (key === 'instapay') {
    if (!instapayRegex.test(account)) throw appError(400, 'invalid_instapay', 'Invalid InstaPay address.');
  } else if (!phoneRegex.test(account)) {
    throw appError(400, 'invalid_wallet_phone', 'Invalid Egyptian wallet phone number.');
  }

  return { methodKey: key, methodLabel: allowed[key], account };
}

function hostMatches(hostname, pattern) {
  const host = lower(hostname);
  const value = lower(pattern);
  if (!host || !value) return false;
  if (value.startsWith('*.')) {
    const root = value.slice(2);
    return host === root || host.endsWith(`.${root}`);
  }
  return host === value;
}

function looksPrivateHost(hostname) {
  const host = lower(hostname);
  if (!host || host === 'localhost' || host.endsWith('.local')) return true;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    const parts = host.split('.').map(Number);
    if (parts[0] === 10 || parts[0] === 127 || parts[0] === 0) return true;
    if (parts[0] === 169 && parts[1] === 254) return true;
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    if (parts[0] === 192 && parts[1] === 168) return true;
  }
  return host === '[::1]' || host.startsWith('fc') || host.startsWith('fd');
}

function getClientIp(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return forwarded || req.ip || req.socket?.remoteAddress || '';
}

function isActiveAd(ad) {
  return !!ad && ad.active === true && ad.status !== 'error' && ad.isBroken !== true;
}

module.exports = {
  asNumber,
  money,
  cleanId,
  lower,
  requireEnv,
  splitCsv,
  normalizePostbackType,
  validateWithdrawMethod,
  hostMatches,
  looksPrivateHost,
  getClientIp,
  isActiveAd
};
