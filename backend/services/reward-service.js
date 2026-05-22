'use strict';

const { db, FieldValue, Timestamp } = require('../firebase-admin');
const { appError } = require('../utils/app-error');
const { randomId, signRewardSession } = require('../utils/crypto');
const { cleanId, asNumber, money, isActiveAd } = require('../utils/validators');
const { getSettings } = require('./settings-service');
const { securityIncident, writeLog } = require('./log-service');

const SESSION_GRACE_MS = 45 * 1000;

function nowIso() {
  return new Date().toISOString();
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function addLimited(item, list, limit = 100) {
  return [item, ...(Array.isArray(list) ? list : [])].slice(0, limit);
}

function requireRewardSecret() {
  if (!process.env.REWARD_SESSION_SECRET) {
    throw appError(500, 'missing_reward_secret', 'REWARD_SESSION_SECRET is not configured.');
  }
  return process.env.REWARD_SESSION_SECRET;
}

function createEarning(type, amount, extra = {}) {
  return {
    id: randomId('earn'),
    date: nowIso(),
    type,
    amount: money(amount),
    ...extra
  };
}

function createTimeline(type, message, extra = {}) {
  return {
    id: randomId('timeline'),
    date: nowIso(),
    type,
    message,
    ...extra
  };
}

async function startSession(uid, data = {}) {
  const adId = cleanId(data.adId);
  const fingerprintHash = String(data.fingerprintHash || '').slice(0, 128);
  const tabId = String(data.tabId || '').slice(0, 128);
  if (!adId) throw appError(400, 'missing_ad_id', 'adId is required.');

  const secret = requireRewardSecret();

  const session = await db.runTransaction(async (tx) => {
    const userRef = db.collection('users').doc(uid);
    const adRef = db.collection('ads').doc(adId);
    const cooldownRef = db.collection('cooldowns').doc(uid);
    const activeRef = db.collection('activeRewards').doc(uid);
    const tabLockRef = db.collection('tabLocks').doc(uid);

    const [userSnap, adSnap, cooldownSnap, activeSnap, tabSnap, settings] = await Promise.all([
      tx.get(userRef),
      tx.get(adRef),
      tx.get(cooldownRef),
      tx.get(activeRef),
      tx.get(tabLockRef),
      getSettings(tx)
    ]);

    if (!userSnap.exists) throw appError(404, 'user_not_found', 'User not found.');
    if (!adSnap.exists) throw appError(404, 'ad_not_found', 'Ad not found.');

    const user = userSnap.data();
    const ad = { id: adSnap.id, ...adSnap.data() };
    const now = Date.now();

    if (user.status === 'banned') throw appError(403, 'user_banned', 'User is banned.');
    if (!isActiveAd(ad)) throw appError(412, 'inactive_ad', 'Ad is inactive or broken.');
    if ((user.todayViews || 0) >= (settings.maxDailyViews || 10)) {
      throw appError(429, 'daily_limit', 'Daily view limit reached.');
    }
    if (cooldownSnap.exists && asNumber(cooldownSnap.data().until) > now) {
      throw appError(429, 'cooldown_active', 'Cooldown is still active.');
    }
    if (activeSnap.exists && asNumber(activeSnap.data().expiresAt) > now) {
      throw appError(409, 'active_session_exists', 'An active reward session already exists.');
    }
    if (tabSnap.exists && tabSnap.data().tabId && tabSnap.data().tabId !== tabId && asNumber(tabSnap.data().expiresAt) > now) {
      throw appError(409, 'multi_tab_blocked', 'Multiple tabs are not allowed.');
    }

    const duration = Math.max(5, Math.min(180, asNumber(ad.duration, 15)));
    const nextSession = {
      id: randomId('reward'),
      userId: uid,
      adId,
      duration,
      startedAtMs: now,
      expiresAtMs: now + duration * 1000 + SESSION_GRACE_MS,
      status: 'started',
      nonce: randomId('nonce'),
      fingerprintHash,
      tabId
    };
    nextSession.signature = signRewardSession(nextSession, secret);

    tx.set(db.collection('rewardSessions').doc(nextSession.id), {
      ...nextSession,
      startedAt: FieldValue.serverTimestamp(),
      expiresAt: Timestamp.fromMillis(nextSession.expiresAtMs),
      createdAt: FieldValue.serverTimestamp()
    }, { merge: false });
    tx.set(activeRef, {
      id: uid,
      userId: uid,
      tabId,
      sessionId: nextSession.id,
      adId,
      expiresAt: nextSession.expiresAtMs,
      updatedAt: nowIso(),
      createdAt: FieldValue.serverTimestamp()
    }, { merge: false });
    tx.set(tabLockRef, {
      id: uid,
      userId: uid,
      tabId,
      heartbeatAt: now,
      expiresAt: now + Math.max(45000, duration * 1000 + 30000),
      updatedAt: nowIso()
    }, { merge: true });

    return nextSession;
  });

  await writeLog('reward_session_started', {
    userId: uid,
    adId,
    sessionId: session.id
  }, 'info');

  return { valid: true, session };
}

async function claimReward(uid, data = {}) {
  const sessionId = cleanId(data.sessionId);
  const adId = cleanId(data.adId);
  const elapsedSeconds = asNumber(data.elapsedSeconds);
  const fingerprint = String(data.fingerprint || data.fingerprintHash || '').slice(0, 128);
  const visibilityStats = data.visibilityStats || {};
  if (!sessionId || !adId) throw appError(400, 'missing_session', 'sessionId and adId are required.');

  const secret = requireRewardSecret();

  try {
    const result = await db.runTransaction(async (tx) => {
      const userRef = db.collection('users').doc(uid);
      const adRef = db.collection('ads').doc(adId);
      const sessionRef = db.collection('rewardSessions').doc(sessionId);
      const claimRef = db.collection('rewardClaims').doc(sessionId);
      const analyticsRef = db.collection('adAnalytics').doc(adId);
      const cooldownRef = db.collection('cooldowns').doc(uid);
      const activeRef = db.collection('activeRewards').doc(uid);
      const tabLockRef = db.collection('tabLocks').doc(uid);

      const [userSnap, adSnap, sessionSnap, claimSnap, cooldownSnap, activeSnap, settings] = await Promise.all([
        tx.get(userRef),
        tx.get(adRef),
        tx.get(sessionRef),
        tx.get(claimRef),
        tx.get(cooldownRef),
        tx.get(activeRef),
        getSettings(tx)
      ]);

      if (!userSnap.exists) throw appError(404, 'user_not_found', 'User not found.');
      if (!adSnap.exists) throw appError(404, 'ad_not_found', 'Ad not found.');
      if (!sessionSnap.exists) throw appError(404, 'session_not_found', 'Reward session not found.');
      if (claimSnap.exists) throw appError(409, 'duplicate_claim', 'Reward was already claimed.');

      const user = { id: userSnap.id, ...userSnap.data() };
      const ad = { id: adSnap.id, ...adSnap.data() };
      const session = { id: sessionSnap.id, ...sessionSnap.data() };
      const now = Date.now();

      if (!isActiveAd(ad)) throw appError(412, 'inactive_ad', 'Ad is inactive or broken.');
      if (session.status !== 'started') throw appError(412, 'invalid_session_status', 'Invalid reward session.');
      if (session.userId !== uid || session.adId !== adId) throw appError(403, 'session_mismatch', 'Session mismatch.');
      if (asNumber(session.expiresAtMs) < now) throw appError(408, 'session_expired', 'Reward session expired.');
      if (session.signature !== signRewardSession(session, secret)) throw appError(403, 'invalid_signature', 'Invalid session signature.');
      if (fingerprint && session.fingerprintHash && fingerprint !== session.fingerprintHash) throw appError(403, 'fingerprint_changed', 'Session fingerprint changed.');
      if (elapsedSeconds + 0.25 < asNumber(session.duration)) throw appError(412, 'duration_incomplete', 'Ad duration not completed.');
      if (asNumber(session.startedAtMs) && now - asNumber(session.startedAtMs) < asNumber(session.duration) * 1000 - 250) {
        throw appError(412, 'impossible_timing', 'Impossible reward timing.');
      }
      if (cooldownSnap.exists && asNumber(cooldownSnap.data().until) > now) throw appError(429, 'cooldown_active', 'Cooldown is still active.');
      if (!activeSnap.exists || activeSnap.data().sessionId !== sessionId) throw appError(412, 'active_lock_missing', 'Active session lock missing.');
      if (asNumber(visibilityStats.hiddenEvents) > 2 || asNumber(visibilityStats.pauseMs) > 10000) {
        throw appError(412, 'inactive_tab', 'Tab visibility/focus validation failed.');
      }

      const reward = money(ad.reward || 0);
      if (reward <= 0 || reward > 1000) throw appError(412, 'invalid_reward', 'Invalid reward amount.');

      const today = todayKey();
      const isNewWatchDay = user.lastWatchDate !== today;
      const nextXp = asNumber(user.xp) + 10;
      let level = user.level || 'Bronze';
      if (nextXp > 600) level = 'Diamond';
      else if (nextXp > 300) level = 'Gold';
      else if (nextXp > 100) level = 'Silver';

      const updatedUser = {
        balance: money((user.balance || 0) + reward),
        totalViews: asNumber(user.totalViews) + 1,
        todayViews: (isNewWatchDay ? 0 : asNumber(user.todayViews)) + 1,
        lastWatchDate: today,
        lastDailyResetAt: isNewWatchDay ? nowIso() : (user.lastDailyResetAt || nowIso()),
        lastRewardSessionId: sessionId,
        lastRewardAt: nowIso(),
        xp: nextXp,
        level,
        earnings: addLimited(createEarning(`مشاهدة إعلان: ${ad.title || adId}`, reward, { adId, sessionId }), user.earnings),
        timeline: addLimited(createTimeline('مشاهدة', `تم احتساب ${reward.toFixed(2)} جنيه بعد مشاهدة إعلان.`, { adId, sessionId }), user.timeline)
      };

      const cooldownSeconds = Math.max(1, Math.min(3600, asNumber(settings.cooldownBetweenAds, 5)));

      tx.set(userRef, updatedUser, { merge: true });
      tx.set(claimRef, {
        id: sessionId,
        userId: uid,
        adId,
        rewardAmount: reward,
        elapsedSeconds,
        visibilityStats,
        fingerprintHash: fingerprint,
        claimedAt: nowIso(),
        createdAt: FieldValue.serverTimestamp()
      }, { merge: false });
      tx.set(sessionRef, {
        status: 'claimed',
        claimedAt: FieldValue.serverTimestamp(),
        claimedAtIso: nowIso()
      }, { merge: true });
      tx.set(cooldownRef, {
        id: uid,
        userId: uid,
        until: now + cooldownSeconds * 1000,
        seconds: cooldownSeconds,
        updatedAt: nowIso()
      }, { merge: true });
      tx.set(analyticsRef, {
        id: adId,
        completedViews: FieldValue.increment(1),
        totalRewards: FieldValue.increment(reward),
        totalWatchTime: FieldValue.increment(elapsedSeconds),
        averageWatchTime: elapsedSeconds,
        lastRewardSessionId: sessionId,
        updatedAt: nowIso()
      }, { merge: true });
      tx.set(adRef, {
        completedViews: FieldValue.increment(1),
        totalRewards: FieldValue.increment(reward),
        lastRewardSessionId: sessionId,
        updatedAt: nowIso()
      }, { merge: true });
      tx.delete(activeRef);
      tx.delete(tabLockRef);

      return { id: uid, ...user, ...updatedUser };
    });

    await writeLog('reward_claim_success', {
      userId: uid,
      adId,
      sessionId
    }, 'notice');

    return { valid: true, user: result };
  } catch (error) {
    await securityIncident('reward_claim_failed', {
      userId: uid,
      adId,
      sessionId,
      code: error.code,
      message: error.message,
      visibilityStats
    }, error.statusCode >= 500 ? 'high' : 'medium');
    throw error;
  }
}

module.exports = {
  startSession,
  claimReward
};
