/* ============================================================
   security.js - client-side hardening and integrity guardrails
   ============================================================ */

'use strict';

const Security = {
  version: '2.0.0',
  tabId: null,
  tabHeartbeatTimer: null,
  currentUserId: null,
  protectedCache: {},
  protectedKeys: new Set([
    'ap_settings',
    'ap_users',
    'ap_ads',
    'ap_withdrawals',
    'ap_ad_analytics'
  ]),

  init() {
    this.tabId = sessionStorage.getItem('ap_tab_id') || this.generateId('tab');
    sessionStorage.setItem('ap_tab_id', this.tabId);
    this.ensureSecret();

    window.addEventListener('beforeunload', () => {
      this.releaseTabLock();
      this.endRewardSession('page-unload');
    });

    window.addEventListener('storage', (event) => {
      if (this.currentUserId && event.key === this.getTabLockKey(this.currentUserId)) {
        this.checkTabLockConflict();
      }
    });

    document.addEventListener('visibilitychange', () => {
      this.recordRewardVisibility(document.hidden ? 'hidden' : 'visible');
    });

    window.addEventListener('blur', () => this.recordRewardVisibility('blur'));
    window.addEventListener('focus', () => this.recordRewardVisibility('focus'));
  },

  ensureSecret() {
    let secret = sessionStorage.getItem('ap_integrity_secret');
    if (!secret) {
      secret = this.generateId('secret') + '-' + Date.now().toString(36);
      sessionStorage.setItem('ap_integrity_secret', secret);
    }
    return secret;
  },

  generateId(prefix = 'id') {
    const random = Math.random().toString(36).slice(2, 12);
    const time = Date.now().toString(36);
    return `${prefix}-${random}-${time}`;
  },

  stableStringify(value) {
    if (value === null || typeof value !== 'object') {
      return JSON.stringify(value);
    }
    if (Array.isArray(value)) {
      return `[${value.map(item => this.stableStringify(item)).join(',')}]`;
    }
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${this.stableStringify(value[key])}`).join(',')}}`;
  },

  hash(input) {
    let hash = 2166136261;
    const str = String(input);
    for (let i = 0; i < str.length; i++) {
      hash ^= str.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
  },

  getFingerprintHash() {
    const data = [
      navigator.userAgent || '',
      navigator.language || '',
      `${screen.width}x${screen.height}x${screen.colorDepth}`,
      Intl.DateTimeFormat().resolvedOptions().timeZone || '',
      navigator.platform || '',
      this.tabId || ''
    ].join('|');
    return this.hash(data);
  },

  sign(key, value) {
    return this.hash(`${this.ensureSecret()}|${key}|${this.stableStringify(value)}|${this.version}`);
  },

  signatureKey(key) {
    return `ap_sig_${key}`;
  },

  clone(value) {
    if (value === undefined) return undefined;
    return JSON.parse(JSON.stringify(value));
  },

  parseJson(raw, fallback) {
    try {
      return raw ? JSON.parse(raw) : this.clone(fallback);
    } catch (error) {
      this.reportSecurityIncident('secure-storage-parse-failed', { message: error.message });
      return this.clone(fallback);
    }
  },

  writeProtected(key, value) {
    const data = this.clone(value);
    this.protectedCache[key] = data;
    this.protectedCache[this.signatureKey(key)] = {
      signature: this.sign(key, data),
      version: this.version,
      updatedAt: new Date().toISOString()
    };
  },

  readProtected(key, fallback) {
    const parsed = this.protectedCache[key];
    if (!parsed) return this.clone(fallback);
    const meta = this.protectedCache[this.signatureKey(key)];
    const expected = this.sign(key, parsed);
    if (!meta || meta.signature !== expected) {
      this.reportSecurityIncident('storage_tamper_detected', { key });
      this.forceSessionReset('تم اكتشاف تعديل غير موثوق في بيانات المنصة. تم إنهاء الجلسة لحماية الحساب.');
      return this.clone(fallback);
    }

    return parsed;
  },

  setSessionUser(user, rememberMe = false) {
    const payload = this.clone(user);
    const signature = this.sign('ap_current_user', payload);
    sessionStorage.setItem('ap_current_user', JSON.stringify(payload));
    sessionStorage.setItem('ap_current_user_sig', signature);
    this.bindTabLock(payload);
  },

  getSessionUser() {
    const raw = sessionStorage.getItem('ap_current_user');
    if (!raw) return null;
    const payload = this.parseJson(raw, null);
    if (!payload) return null;

    const sig = sessionStorage.getItem('ap_current_user_sig');
    if (!sig) {
      sessionStorage.setItem('ap_current_user_sig', this.sign('ap_current_user', payload));
      return payload;
    }

    if (sig !== this.sign('ap_current_user', payload)) {
      this.reportSecurityIncident('session_tamper_detected', { userId: payload.id });
      this.forceSessionReset('تم اكتشاف تعديل غير موثوق في بيانات الجلسة. يرجى تسجيل الدخول مرة أخرى.');
      return null;
    }

    return payload;
  },

  clearSessionUser() {
    sessionStorage.removeItem('ap_current_user');
    sessionStorage.removeItem('ap_current_user_sig');
    this.releaseTabLock();
  },

  getTabLockKey(userId) {
    return `ap_tab_lock_${userId}`;
  },

  bindTabLock(user) {
    if (!user || !user.id) return true;
    this.currentUserId = user.id;
    const lockKey = this.getTabLockKey(user.id);
    const now = Date.now();
    const existing = window.FirestoreService ? window.FirestoreService.getTabLock(user.id) : null;

    if (existing && existing.tabId !== this.tabId && existing.expiresAt > now) {
      this.reportSecurityIncident('multi_tab_blocked', { userId: user.id });
      this.forceSessionReset('لا يمكن فتح الحساب في أكثر من تبويب في نفس الوقت. تم إنهاء الجلسة الحالية.');
      return false;
    }

    this.writeTabLock(user.id);
    clearInterval(this.tabHeartbeatTimer);
    this.tabHeartbeatTimer = setInterval(() => this.writeTabLock(user.id), 15000);
    return true;
  },

  writeTabLock(userId) {
    const lock = {
      userId,
      tabId: this.tabId,
      heartbeatAt: Date.now(),
      expiresAt: Date.now() + 45000
    };
    if (window.FirestoreService) {
      window.FirestoreService.setTabLock(userId, lock);
    }
  },

  checkTabLockConflict() {
    if (!this.currentUserId) return;
    const lock = window.FirestoreService ? window.FirestoreService.getTabLock(this.currentUserId) : null;
    if (lock && lock.tabId !== this.tabId && lock.expiresAt > Date.now()) {
      this.reportSecurityIncident('tab_lock_conflict', { userId: this.currentUserId });
      this.forceSessionReset('تم فتح الحساب من تبويب آخر. تم إيقاف هذه الجلسة.');
    }
  },

  releaseTabLock() {
    if (!this.currentUserId) return;
    if (window.FirestoreService) {
      window.FirestoreService.releaseTabLock(this.currentUserId, this.tabId);
    }
    clearInterval(this.tabHeartbeatTimer);
    this.tabHeartbeatTimer = null;
    this.currentUserId = null;
  },

  recordAction(action, limit = 6, windowMs = 2000) {
    const key = `ap_action_${action}`;
    const now = Date.now();
    const events = this.parseJson(sessionStorage.getItem(key), []).filter(ts => now - ts <= windowMs);
    events.push(now);
    sessionStorage.setItem(key, JSON.stringify(events));
    if (events.length > limit) {
      this.reportSecurityIncident('rapid_action_detected', { action, count: events.length });
      return false;
    }
    return true;
  },

  getCooldownKey(userId) {
    return `ap_reward_cooldown_${userId}`;
  },

  setCooldown(userId, seconds) {
    if (!userId || seconds <= 0) return;
    if (window.FirestoreService) {
      window.FirestoreService.setCooldown(userId, seconds);
    }
  },

  getRemainingCooldown(userId) {
    return window.FirestoreService ? window.FirestoreService.getRemainingCooldown(userId) : 0;
  },

  getActiveRewardKey(userId) {
    return `ap_active_reward_${userId}`;
  },

  getActiveRewardLock(userId) {
    return window.FirestoreService ? window.FirestoreService.getActiveRewardLock(userId) : null;
  },

  setActiveRewardLock(userId, lock) {
    if (window.FirestoreService) {
      window.FirestoreService.setActiveRewardLock(userId, lock);
    }
  },

  clearActiveRewardLock(userId, sessionId = null) {
    if (!userId) return;
    const lock = this.getActiveRewardLock(userId);
    if (!lock || lock.tampered) return;
    if (!sessionId || lock.sessionId === sessionId || lock.tabId === this.tabId) {
      if (window.FirestoreService) {
        window.FirestoreService.clearActiveRewardLock(userId);
      }
    }
  },

  verifyRuntime() {
    const required = [
      ['Auth.getCurrentUser', window.Auth && typeof window.Auth.getCurrentUser === 'function'],
      ['StorageDB.updateUser', window.StorageDB && typeof window.StorageDB.updateUser === 'function'],
      ['StorageDB.incrementAdMetric', window.StorageDB && typeof window.StorageDB.incrementAdMetric === 'function'],
      ['AdEngine.verifyAdSession', window.AdEngine && typeof window.AdEngine.verifyAdSession === 'function']
    ];
    const missing = required.filter(([, ok]) => !ok).map(([name]) => name);
    if (missing.length > 0) {
      this.reportSecurityIncident('runtime_integrity_failed', { missing });
      return false;
    }
    return true;
  },

  createRewardSession(ad, duration) {
    const user = window.Auth ? window.Auth.getCurrentUser() : null;
    if (!user || !ad) return null;
    if (!this.verifyRuntime()) return null;
    if (!this.recordAction('start_ad', 4, 2000)) return null;
    if (this.getRemainingCooldown(user.id) > 0) return null;

    const activeLock = this.getActiveRewardLock(user.id);
    if (activeLock) {
      this.reportSecurityIncident('parallel_reward_blocked', {
        userId: user.id,
        activeSessionId: activeLock.sessionId || null,
        currentTab: this.tabId
      });
      return null;
    }

    const session = {
      id: this.generateId('reward'),
      adId: ad.id,
      userId: user.id,
      duration: Number(duration) || Number(ad.duration) || 15,
      startWall: Date.now(),
      startPerf: performance.now(),
      startedVisible: !document.hidden,
      hiddenEvents: document.hidden ? 1 : 0,
      focusEvents: 0,
      pauseMs: 0,
      lastVisibilityAt: Date.now(),
      nonce: this.generateId('nonce')
    };
    session.signature = this.sign('ap_ad_session', session);
    sessionStorage.setItem('ap_ad_session', btoa(JSON.stringify(session)));
    if (window.FirestoreService) {
      window.FirestoreService.createRewardSessionRecord(session);
    }
    this.setActiveRewardLock(user.id, {
      tabId: this.tabId,
      sessionId: session.id,
      adId: ad.id,
      expiresAt: Date.now() + (session.duration + 45) * 1000
    });
    return session;
  },

  getRewardSession() {
    const encoded = sessionStorage.getItem('ap_ad_session');
    if (!encoded) return null;
    try {
      const session = JSON.parse(atob(encoded));
      const signature = session.signature;
      const unsigned = { ...session };
      delete unsigned.signature;
      if (signature !== this.sign('ap_ad_session', unsigned)) {
        this.reportSecurityIncident('reward_token_tamper_detected', { adId: session.adId });
        this.endRewardSession('tamper');
        return null;
      }
      return session;
    } catch (error) {
      this.reportSecurityIncident('reward_token_parse_error', { message: error.message });
      this.endRewardSession('parse-error');
      return null;
    }
  },

  saveRewardSession(session) {
    const unsigned = { ...session };
    delete unsigned.signature;
    unsigned.signature = this.sign('ap_ad_session', unsigned);
    sessionStorage.setItem('ap_ad_session', btoa(JSON.stringify(unsigned)));
  },

  saveServerRewardSession(serverSession, ad, duration) {
    const user = window.Auth ? window.Auth.getCurrentUser() : null;
    if (!user || !serverSession) return null;
    const session = {
      ...serverSession,
      serverSignature: serverSession.signature || null,
      adId: serverSession.adId || ad?.id,
      userId: serverSession.userId || user.id,
      duration: Number(serverSession.duration) || Number(duration) || Number(ad?.duration) || 15,
      startWall: Date.now(),
      startPerf: performance.now(),
      startedVisible: !document.hidden,
      hiddenEvents: document.hidden ? 1 : 0,
      focusEvents: 0,
      pauseMs: 0,
      lastVisibilityAt: Date.now(),
      fingerprintHash: serverSession.fingerprintHash || this.getFingerprintHash()
    };
    delete session.signature;
    session.signature = this.sign('ap_ad_session', session);
    sessionStorage.setItem('ap_ad_session', btoa(JSON.stringify(session)));
    return session;
  },

  recordRewardVisibility(type) {
    const session = this.getRewardSession();
    if (!session) return;
    const now = Date.now();
    if (type === 'hidden') {
      session.hiddenEvents = (session.hiddenEvents || 0) + 1;
      session.lastVisibilityAt = now;
    } else if (type === 'visible' && session.lastVisibilityAt) {
      session.pauseMs = (session.pauseMs || 0) + Math.max(0, now - session.lastVisibilityAt);
      session.lastVisibilityAt = now;
    } else if (type === 'blur' || type === 'focus') {
      session.focusEvents = (session.focusEvents || 0) + 1;
    }
    this.saveRewardSession(session);
  },

  verifyRewardSession(adId, actualElapsedSeconds) {
    const session = this.getRewardSession();
    if (!session) {
      return { valid: false, reason: 'لم يتم العثور على جلسة مشاهدة صالحة.' };
    }

    const user = window.Auth ? window.Auth.getCurrentUser() : null;
    if (!user || user.id !== session.userId) {
      this.endRewardSession('user-mismatch');
      return { valid: false, reason: 'جلسة المشاهدة لا تطابق الحساب الحالي.' };
    }

    if (session.adId !== adId) {
      this.endRewardSession('ad-mismatch');
      return { valid: false, reason: 'معرف الإعلان لا يطابق جلسة المشاهدة.' };
    }

    const requiredMs = Math.max(0, session.duration * 1000 - 250);
    const wallElapsed = Date.now() - session.startWall;
    const perfElapsed = performance.now() - session.startPerf;
    const activeElapsedMs = wallElapsed - (session.pauseMs || 0);

    if (wallElapsed < requiredMs || perfElapsed < requiredMs || activeElapsedMs < requiredMs) {
      return { valid: false, reason: 'تم رفض المكافأة بسبب توقيت مشاهدة غير كاف أو غير منطقي.' };
    }

    if (Math.abs(wallElapsed - perfElapsed) > 5000) {
      this.reportSecurityIncident('time_tamper_detected', { wallElapsed, perfElapsed });
      return { valid: false, reason: 'تم اكتشاف تغيير غير طبيعي في توقيت الجهاز أثناء المشاهدة.' };
    }

    if (Number(actualElapsedSeconds) + 0.25 < Number(session.duration)) {
      return { valid: false, reason: 'عداد المشاهدة لم يكتمل داخل الواجهة.' };
    }

    session.visibilityStats = {
      hiddenEvents: session.hiddenEvents || 0,
      focusEvents: session.focusEvents || 0,
      pauseMs: session.pauseMs || 0,
      startedVisible: session.startedVisible !== false
    };
    this.endRewardSession('claimed');
    return { valid: true, session };
  },

  endRewardSession(reason = 'manual') {
    const encoded = sessionStorage.getItem('ap_ad_session');
    if (encoded) {
      try {
        const session = JSON.parse(atob(encoded));
        if (session && session.userId) {
          this.clearActiveRewardLock(session.userId, session.id);
        }
      } catch (error) {
        this.reportSecurityIncident('reward_session_cleanup_parse_error', {
          reason,
          message: error.message
        });
      }
    }
    sessionStorage.removeItem('ap_ad_session');
  },

  reportSecurityIncident(type, detail = {}) {
    if (window.FirestoreService) {
      window.FirestoreService.reportSecurityIncident(type, { ...detail, tabId: this.tabId });
    }
  },

  forceSessionReset(message) {
    this.clearSessionUser();
    if (message && typeof window !== 'undefined') {
      try { alert(message); } catch (error) {}
    }
  }
};

Security.init();
window.Security = Security;
