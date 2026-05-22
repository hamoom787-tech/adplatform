'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { sha256, timingSafeEqualHex, signRewardSession } = require('../utils/crypto');

test('sha256 matches TimeWall formula shape', () => {
  const secret = 'test_timewall_secret';
  const hash = sha256(`user1231.25${secret}`);
  assert.equal(hash.length, 64);
  assert.match(hash, /^[a-f0-9]{64}$/);
});

test('timingSafeEqualHex accepts equal hex and rejects mismatch', () => {
  const value = sha256('abc');
  assert.equal(timingSafeEqualHex(value, value), true);
  assert.equal(timingSafeEqualHex(value, sha256('xyz')), false);
  assert.equal(timingSafeEqualHex(value, 'bad'), false);
});

test('reward session signature is stable and tamper-sensitive', () => {
  const session = {
    id: 's1',
    userId: 'u1',
    adId: 'a1',
    duration: 20,
    nonce: 'n',
    fingerprintHash: 'fp',
    startedAtMs: 1000,
    expiresAtMs: 30000
  };
  const first = signRewardSession(session, 'secret');
  const second = signRewardSession(session, 'secret');
  assert.equal(first, second);
  assert.notEqual(first, signRewardSession({ ...session, duration: 21 }, 'secret'));
});
