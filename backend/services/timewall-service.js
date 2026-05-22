'use strict';

const { db, FieldValue } = require('../firebase-admin');
const { sha256, timingSafeEqualHex, randomId } = require('../utils/crypto');
const { appError } = require('../utils/app-error');
const { cleanId, money, normalizePostbackType } = require('../utils/validators');
const { securityIncident, writeLog } = require('./log-service');

function nowIso() {
  return new Date().toISOString();
}

function addLimited(item, list, limit = 100) {
  return [item, ...(Array.isArray(list) ? list : [])].slice(0, limit);
}

function timeline(type, message, extra = {}) {
  return {
    id: randomId('timeline'),
    date: nowIso(),
    type,
    message,
    ...extra
  };
}

function earning(type, amount, extra = {}) {
  return {
    id: randomId('earn'),
    date: nowIso(),
    type,
    amount: money(amount),
    ...extra
  };
}

function validateHash({ userID, revenue, hash }) {
  const secret = process.env.TIMEWALL_SECRET;
  if (!secret) throw appError(500, 'missing_timewall_secret', 'TIMEWALL_SECRET is not configured.');
  const expected = sha256(`${userID}${String(revenue)}${secret}`);
  if (!timingSafeEqualHex(expected, hash)) {
    throw appError(403, 'invalid_hash', 'Invalid TimeWall hash.');
  }
}

async function processPostback(query, meta = {}) {
  const userId = String(query.userID || '').trim();
  const transactionId = cleanId(query.transactionID);
  const rawCurrencyAmount = query.currencyAmount;
  const rawRevenue = query.revenue || query['ربح'];
  const amount = money(rawCurrencyAmount);
  const revenue = money(rawRevenue);
  const type = normalizePostbackType(query.type || query['يكتب'], amount);
  const offername = String(query.offername || '');
  const withdrawid = String(query.withdrawid || '');
  const reason = String(query.reason || '');
  const offerdetail = String(query.offerdetail || '');

  if (!userId || !transactionId) {
    throw appError(400, 'invalid_payload', 'userID and transactionID are required.');
  }
  if (!['credit', 'reversal', 'pending', 'hold_cancelled'].includes(type)) {
    throw appError(400, 'invalid_type', 'Unsupported TimeWall transaction type.');
  }
  if (!Number.isFinite(amount) || !Number.isFinite(revenue)) {
    throw appError(400, 'invalid_amount', 'Invalid TimeWall numbers.');
  }

  try {
    validateHash({ userID: userId, revenue: rawRevenue, hash: query.hash });
  } catch (error) {
    await securityIncident('timewall_hash_mismatch', {
      userId,
      transactionId,
      revenue: rawRevenue,
      sourceIp: meta.ip
    }, 'high');
    throw error;
  }

  const result = { duplicate: false, type };

  await db.runTransaction(async (tx) => {
    const userRef = db.collection('users').doc(userId);
    const txRef = db.collection('transactions').doc(transactionId);
    const pendingRef = db.collection('pendingRewards').doc(transactionId);

    const [userSnap, txSnap, pendingSnap] = await Promise.all([
      tx.get(userRef),
      tx.get(txRef),
      tx.get(pendingRef)
    ]);

    if (!userSnap.exists) throw appError(404, 'user_not_found', 'TimeWall user does not exist.');

    const user = userSnap.data();
    const existing = txSnap.exists ? txSnap.data() : {};
    const processedTypes = existing.processedTypes || {};

    if (processedTypes[type]) {
      if (existing.userId !== userId || money(existing.amount) !== amount || money(existing.revenue) !== revenue) {
        throw appError(403, 'transaction_replay_mismatch', 'Duplicate transaction mismatch.');
      }
      result.duplicate = true;
      return;
    }

    if (existing.userId && existing.userId !== userId) {
      throw appError(403, 'transaction_user_mismatch', 'Transaction belongs to another user.');
    }

    const nextUser = { ...user };
    const absAmount = Math.abs(amount);
    const event = {
      type,
      amount,
      revenue,
      offername,
      withdrawid,
      reason,
      offerdetail,
      ip: String(query.ip || ''),
      sourceIp: meta.ip || '',
      date: nowIso()
    };

    if (type === 'pending') {
      if (!pendingSnap.exists) {
        nextUser.pendingBalance = money((nextUser.pendingBalance || 0) + absAmount);
        tx.set(pendingRef, {
          id: transactionId,
          userId,
          amount: absAmount,
          revenue,
          offername,
          withdrawid,
          reason,
          status: 'pending',
          date: nowIso(),
          createdAt: FieldValue.serverTimestamp()
        }, { merge: false });
      }
    }

    if (type === 'credit') {
      if (pendingSnap.exists && pendingSnap.data().status === 'pending') {
        const pending = pendingSnap.data();
        nextUser.pendingBalance = money(Math.max(0, (nextUser.pendingBalance || 0) - (pending.amount || absAmount)));
        tx.set(pendingRef, {
          status: 'credited',
          creditedAt: FieldValue.serverTimestamp(),
          updatedAt: nowIso()
        }, { merge: true });
      }
      nextUser.balance = money((nextUser.balance || 0) + absAmount);
      nextUser.earnings = addLimited(earning(`TimeWall: ${offername || 'Offer'}`, absAmount, { transactionID: transactionId }), nextUser.earnings);
      nextUser.timeline = addLimited(timeline('TimeWall', `تمت إضافة ${absAmount.toFixed(2)} جنيه من TimeWall.`, { transactionID: transactionId }), nextUser.timeline);
    }

    if (type === 'reversal') {
      const debit = Math.min(money(nextUser.balance || 0), absAmount);
      const debt = money(absAmount - debit);
      nextUser.balance = money((nextUser.balance || 0) - debit);
      nextUser.chargebackDebt = money((nextUser.chargebackDebt || 0) + debt);
      nextUser.earnings = addLimited(earning(`TimeWall Reversal: ${offername || 'Offer'}`, -absAmount, { transactionID: transactionId }), nextUser.earnings);
      nextUser.timeline = addLimited(timeline('استرداد', `تم خصم ${absAmount.toFixed(2)} جنيه بسبب chargeback من TimeWall.`, { transactionID: transactionId }), nextUser.timeline);
    }

    if (type === 'hold_cancelled') {
      if (pendingSnap.exists && pendingSnap.data().status === 'pending') {
        const pending = pendingSnap.data();
        nextUser.pendingBalance = money(Math.max(0, (nextUser.pendingBalance || 0) - (pending.amount || absAmount)));
        tx.set(pendingRef, {
          status: 'hold_cancelled',
          cancelledAt: FieldValue.serverTimestamp(),
          updatedAt: nowIso()
        }, { merge: true });
      } else if (processedTypes.credit && !processedTypes.reversal) {
        const debit = Math.min(money(nextUser.balance || 0), absAmount);
        const debt = money(absAmount - debit);
        nextUser.balance = money((nextUser.balance || 0) - debit);
        nextUser.chargebackDebt = money((nextUser.chargebackDebt || 0) + debt);
      }
    }

    tx.set(userRef, nextUser, { merge: true });
    tx.set(txRef, {
      id: transactionId,
      userId,
      amount,
      revenue,
      hash: String(query.hash || ''),
      type,
      status: type,
      offername,
      withdrawid,
      reason,
      offerdetail,
      ip: String(query.ip || ''),
      sourceIp: meta.ip || '',
      processedTypes: { ...processedTypes, [type]: true },
      events: FieldValue.arrayUnion(event),
      processedAt: FieldValue.serverTimestamp(),
      updatedAt: nowIso(),
      createdAt: existing.createdAt || FieldValue.serverTimestamp()
    }, { merge: true });
  });

  await writeLog('timewall_postback', {
    userId,
    transactionId,
    type,
    duplicate: result.duplicate,
    amount,
    revenue
  }, result.duplicate ? 'info' : 'notice');

  return result;
}

module.exports = {
  processPostback,
  validateHash
};
