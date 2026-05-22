'use strict';

const crypto = require('crypto');

function sha256(value) {
  return crypto.createHash('sha256').update(String(value), 'utf8').digest('hex');
}

function hmac(secret, value) {
  return crypto.createHmac('sha256', String(secret)).update(String(value), 'utf8').digest('hex');
}

function timingSafeEqualHex(leftValue, rightValue) {
  const left = Buffer.from(String(leftValue || '').trim().toLowerCase(), 'hex');
  const right = Buffer.from(String(rightValue || '').trim().toLowerCase(), 'hex');
  if (!left.length || left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function rewardSessionPayload(session) {
  return [
    session.id,
    session.userId,
    session.adId,
    session.duration,
    session.nonce,
    session.fingerprintHash,
    session.startedAtMs,
    session.expiresAtMs
  ].join('|');
}

function signRewardSession(session, secret) {
  return hmac(secret, rewardSessionPayload(session));
}

function randomId(prefix = 'id') {
  return `${prefix}_${crypto.randomUUID()}`;
}

module.exports = {
  sha256,
  hmac,
  timingSafeEqualHex,
  rewardSessionPayload,
  signRewardSession,
  randomId
};
