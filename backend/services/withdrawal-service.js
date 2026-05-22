'use strict';

const { db, FieldValue } = require('../firebase-admin');
const { appError } = require('../utils/app-error');
const { randomId } = require('../utils/crypto');
const { money, validateWithdrawMethod } = require('../utils/validators');
const { getSettings } = require('./settings-service');
const { writeLog, securityIncident } = require('./log-service');

function nowIso() {
  return new Date().toISOString();
}

function addLimited(item, list, limit = 100) {
  return [item, ...(Array.isArray(list) ? list : [])].slice(0, limit);
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

function timeline(type, message, extra = {}) {
  return {
    id: randomId('timeline'),
    date: nowIso(),
    type,
    message,
    ...extra
  };
}

async function requestWithdrawal(uid, decodedToken, data = {}) {
  const amount = money(data.amount);
  if (!Number.isFinite(amount) || amount <= 0) throw appError(400, 'invalid_amount', 'Invalid withdrawal amount.');
  const method = validateWithdrawMethod(data.methodKey || data.method, data.account || data.walletNumber || data.phone);

  try {
    const result = await db.runTransaction(async (tx) => {
      const userRef = db.collection('users').doc(uid);
      const userSnap = await tx.get(userRef);
      const settings = await getSettings(tx);

      if (!userSnap.exists) throw appError(404, 'user_not_found', 'User not found.');
      if (settings.withdrawalsEnabled === false) throw appError(412, 'withdrawals_disabled', 'Withdrawals are disabled.');

      const minWithdraw = money(settings.minWithdraw || 50);
      if (amount < minWithdraw) throw appError(412, 'below_minimum', `Minimum withdrawal is ${minWithdraw.toFixed(2)}.`);

      const user = { id: userSnap.id, ...userSnap.data() };
      if (user.pendingWithdrawalId) throw appError(409, 'pending_withdrawal_exists', 'Pending withdrawal already exists.');
      if (money(user.balance || 0) < amount) throw appError(412, 'insufficient_balance', 'Insufficient balance.');

      const pendingQuery = db.collection('withdrawals')
        .where('userId', '==', uid)
        .where('status', '==', 'pending')
        .limit(1);
      const pendingSnap = await tx.get(pendingQuery);
      if (!pendingSnap.empty) throw appError(409, 'pending_withdrawal_exists', 'Pending withdrawal already exists.');

      const withdrawalRef = db.collection('withdrawals').doc();
      const withdrawal = {
        id: withdrawalRef.id,
        userId: uid,
        userName: user.name || decodedToken.name || decodedToken.email || 'User',
        amount,
        ...method,
        status: 'pending',
        date: nowIso(),
        createdAt: FieldValue.serverTimestamp(),
        auditTrail: [{
          id: randomId('audit'),
          status: 'pending',
          date: nowIso(),
          note: 'تم إنشاء طلب السحب من Render Backend'
        }]
      };

      const nextUser = {
        balance: money((user.balance || 0) - amount),
        pendingWithdrawalId: withdrawal.id,
        lastWithdrawalId: withdrawal.id,
        lastWithdrawalAt: nowIso(),
        earnings: addLimited(earning('طلب سحب', -amount, { withdrawalId: withdrawal.id }), user.earnings),
        timeline: addLimited(timeline('سحب', `تم تقديم طلب سحب بقيمة ${amount.toFixed(2)} جنيه عبر ${method.methodLabel}.`, { withdrawalId: withdrawal.id }), user.timeline)
      };

      tx.set(withdrawalRef, withdrawal, { merge: false });
      tx.set(userRef, nextUser, { merge: true });

      return {
        withdrawal: { ...withdrawal, createdAt: null },
        user: { ...user, ...nextUser }
      };
    });

    await writeLog('withdrawal_requested', {
      userId: uid,
      withdrawalId: result.withdrawal.id,
      amount: result.withdrawal.amount,
      methodKey: result.withdrawal.methodKey
    }, 'notice');

    return { valid: true, ...result };
  } catch (error) {
    await securityIncident('withdrawal_request_failed', {
      userId: uid,
      amount,
      methodKey: data.methodKey || data.method,
      code: error.code,
      message: error.message
    }, error.statusCode >= 500 ? 'high' : 'medium');
    throw error;
  }
}

async function reviewWithdrawal(adminUid, data = {}) {
  const withdrawalId = String(data.withdrawalId || data.id || '').trim();
  const status = String(data.status || '').trim().toLowerCase();
  const note = String(data.note || '').slice(0, 500);
  if (!withdrawalId || !['approved', 'rejected'].includes(status)) {
    throw appError(400, 'invalid_review', 'Invalid withdrawal review payload.');
  }

  const result = await db.runTransaction(async (tx) => {
    const withdrawalRef = db.collection('withdrawals').doc(withdrawalId);
    const withdrawalSnap = await tx.get(withdrawalRef);
    if (!withdrawalSnap.exists) throw appError(404, 'withdrawal_not_found', 'Withdrawal request not found.');

    const withdrawal = { id: withdrawalSnap.id, ...withdrawalSnap.data() };
    if (withdrawal.status !== 'pending') throw appError(412, 'already_reviewed', 'Withdrawal was already reviewed.');

    const userRef = db.collection('users').doc(withdrawal.userId);
    const userSnap = await tx.get(userRef);
    if (!userSnap.exists) throw appError(404, 'user_not_found', 'Withdrawal user not found.');

    const user = { id: userSnap.id, ...userSnap.data() };
    const amount = money(withdrawal.amount);
    const audit = {
      id: randomId('audit'),
      status,
      date: nowIso(),
      note: note || (status === 'approved' ? 'تم قبول طلب السحب' : 'تم رفض طلب السحب وإرجاع الرصيد'),
      reviewedBy: adminUid
    };

    const nextWithdrawal = {
      status,
      reviewedAt: nowIso(),
      reviewedBy: adminUid,
      reviewNote: note || null,
      auditTrail: [...(Array.isArray(withdrawal.auditTrail) ? withdrawal.auditTrail : []), audit],
      updatedAt: FieldValue.serverTimestamp()
    };

    const nextUser = {
      pendingWithdrawalId: user.pendingWithdrawalId === withdrawalId ? null : (user.pendingWithdrawalId || null),
      timeline: addLimited(timeline(status === 'approved' ? 'قبول سحب' : 'رفض سحب', status === 'approved'
        ? `تم قبول طلب سحب بقيمة ${amount.toFixed(2)} جنيه.`
        : `تم رفض طلب سحب بقيمة ${amount.toFixed(2)} جنيه وإرجاع المبلغ للحساب.`, { withdrawalId }), user.timeline)
    };

    if (status === 'rejected') {
      nextUser.balance = money((user.balance || 0) + amount);
      nextUser.earnings = addLimited(earning('إرجاع طلب سحب مرفوض', amount, { withdrawalId }), user.earnings);
    }

    tx.set(withdrawalRef, nextWithdrawal, { merge: true });
    tx.set(userRef, nextUser, { merge: true });

    return {
      withdrawal: { ...withdrawal, ...nextWithdrawal },
      user: { ...user, ...nextUser }
    };
  });

  await writeLog('withdrawal_reviewed', {
    adminUid,
    withdrawalId,
    status
  }, 'notice');

  return { valid: true, ...result };
}

module.exports = {
  requestWithdrawal,
  reviewWithdrawal
};
