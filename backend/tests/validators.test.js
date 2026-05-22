'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizePostbackType,
  validateWithdrawMethod,
  looksPrivateHost,
  hostMatches,
  money
} = require('../utils/validators');

test('normalizes TimeWall reversal/refund and negative values', () => {
  assert.equal(normalizePostbackType('credit', 10), 'credit');
  assert.equal(normalizePostbackType('refund', 10), 'reversal');
  assert.equal(normalizePostbackType('reversal', 10), 'reversal');
  assert.equal(normalizePostbackType('', -10), 'reversal');
});

test('validates Egyptian wallets and InstaPay address', () => {
  assert.equal(validateWithdrawMethod('vodafone_cash', '01012345678').methodLabel, 'Vodafone Cash');
  assert.equal(validateWithdrawMethod('instapay', 'memo@instapay').methodLabel, 'InstaPay');
  assert.throws(() => validateWithdrawMethod('vodafone_cash', '123'));
  assert.throws(() => validateWithdrawMethod('instapay', 'wrong'));
});

test('blocks private hosts and matches wildcard hosts', () => {
  assert.equal(looksPrivateHost('localhost'), true);
  assert.equal(looksPrivateHost('127.0.0.1'), true);
  assert.equal(looksPrivateHost('192.168.1.10'), true);
  assert.equal(looksPrivateHost('example.com'), false);
  assert.equal(hostMatches('sub.example.com', '*.example.com'), true);
  assert.equal(hostMatches('example.org', '*.example.com'), false);
});

test('money rounds safely', () => {
  assert.equal(money('1.235'), 1.24);
  assert.equal(money('bad'), 0);
});
