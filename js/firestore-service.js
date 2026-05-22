/* ============================================================
   firestore-service.js - Firestore data layer and realtime cache
   ============================================================ */

'use strict';

const FirestoreService = {
  defaults: null,
  readyPromise: Promise.resolve(false),
  unsubscribers: [],
  userScopedUnsubscribers: [],
  baseRealtimeStarted: false,
  watchedScopeKey: null,
  cacheKey: 'ap_firestore_cache_v3',
  cacheTtlMs: 5 * 60 * 1000,
  cacheLoadedAt: {},
  cache: {
    settings: null,
    users: [],
    ads: [],
    withdrawals: [],
    analytics: {},
    cooldowns: {},
    activeRewards: {},
    tabLocks: {}
  },

  init(defaults) {
    this.defaults = this.clone(defaults || {});
    this.cache.settings = this.clone(defaults?.settings || {});
    this.cache.ads = this.clone(defaults?.ads || []);
    this.cache.withdrawals = this.clone(defaults?.withdrawals || []);
    this.cache.users = this.clone(defaults?.users || []);
    this.cache.analytics = {};
    this.hydrateSessionCache();

    if (!this.isAvailable()) {
      console.warn('[FirestoreService] Firebase is not configured. Runtime cache uses defaults until firebaseConfig is set.');
      return Promise.resolve(false);
    }

    this.readyPromise = (async () => {
      const context = this.getPageContext();
      if (context.realtimeSettings || context.realtimeAds || context.realtimeAnalytics) {
        await this.startBaseRealtimeSync(context);
      }

      const jobs = [];
      if (context.needsSettings && !context.realtimeSettings) jobs.push(this.ensureSettings());
      if (context.needsAds && !context.realtimeAds) jobs.push(this.ensureAds());
      if (context.needsAnalytics && !context.realtimeAnalytics) jobs.push(this.ensureAnalytics());
      await Promise.all(jobs);
      return true;
    })();
    return this.readyPromise;
  },

  ready() {
    return this.readyPromise;
  },

  isAvailable() {
    return !!(window.FirebaseService && window.FirebaseService.isAvailable && window.FirebaseService.db);
  },

  db() {
    return window.FirebaseService.db;
  },

  fv() {
    return window.FirebaseService.FieldValue;
  },

  clone(value) {
    if (value === undefined) return undefined;
    return JSON.parse(JSON.stringify(value));
  },

  nowIso() {
    return new Date().toISOString();
  },

  generateUUID(prefix = 'id') {
    const rand = Math.random().toString(36).substring(2, 10);
    const time = Date.now().toString(36);
    return `${prefix}-${rand}-${time}`;
  },

  docData(doc) {
    const data = doc.data() || {};
    return { id: data.id || doc.id, ...data };
  },

  collectionToArray(snapshot) {
    return snapshot.docs.map(doc => this.docData(doc));
  },

  getPageContext() {
    const path = String(window.location?.pathname || '').toLowerCase();
    const isAdminPage = path.includes('/admin/');
    const isAdminAds = isAdminPage && path.includes('ads.html');
    const isAdminUsers = isAdminPage && path.includes('users.html');
    const isAdminWithdrawals = isAdminPage && path.includes('withdrawals.html');
    const isAdminSettings = isAdminPage && path.includes('settings.html');
    const isAdminDashboard = isAdminPage && !isAdminAds && !isAdminUsers && !isAdminWithdrawals && !isAdminSettings;
    const isAdsPage = !isAdminPage && path.endsWith('/ads.html');
    const isDashboardPage = !isAdminPage && (path.endsWith('/dashboard.html') || path.endsWith('/wallet.html'));
    const isWalletPage = !isAdminPage && path.endsWith('/wallet.html');
    const isAuthPage = path.endsWith('/login.html') || path.endsWith('/register.html');

    return {
      path,
      pageKey: [
        isAdminDashboard && 'admin-dashboard',
        isAdminAds && 'admin-ads',
        isAdminUsers && 'admin-users',
        isAdminWithdrawals && 'admin-withdrawals',
        isAdminSettings && 'admin-settings',
        isAdsPage && 'ads',
        isWalletPage && 'wallet',
        isDashboardPage && 'dashboard',
        isAuthPage && 'auth'
      ].filter(Boolean).join(':') || 'public',
      isAdminPage,
      isAdminAds,
      isAdminUsers,
      isAdminWithdrawals,
      isAdminSettings,
      isAdminDashboard,
      isAdsPage,
      isDashboardPage,
      isWalletPage,
      isAuthPage,
      needsSettings: isAdminPage || isAdsPage || isDashboardPage || isAuthPage,
      needsAds: isAdsPage || isAdminAds || isAdminDashboard,
      needsAnalytics: isAdminAds || isAdminDashboard,
      realtimeSettings: isAdminPage || isAdsPage || isDashboardPage,
      realtimeAds: isAdsPage || isAdminAds || isAdminDashboard,
      realtimeAnalytics: isAdminAds || isAdminDashboard
    };
  },

  emitCacheEvent(type) {
    try {
      window.dispatchEvent(new CustomEvent('ap:data-changed', { detail: { type } }));
    } catch (error) {
      // CustomEvent can fail in very old embedded browsers; data is still cached.
    }
  },

  hydrateSessionCache() {
    try {
      const raw = window.sessionStorage?.getItem(this.cacheKey);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (!saved || saved.version !== this.cacheKey || Date.now() - Number(saved.ts || 0) > this.cacheTtlMs) return;
      if (saved.settings) this.cache.settings = { ...this.cache.settings, ...saved.settings };
      if (Array.isArray(saved.ads)) this.cache.ads = saved.ads;
      if (saved.analytics && typeof saved.analytics === 'object') this.cache.analytics = saved.analytics;
      this.cacheLoadedAt.settings = saved.ts;
      this.cacheLoadedAt.ads = saved.ts;
      this.cacheLoadedAt.analytics = saved.ts;
    } catch (error) {
      try { window.sessionStorage?.removeItem(this.cacheKey); } catch (ignore) {}
    }
  },

  persistSessionCache() {
    try {
      window.sessionStorage?.setItem(this.cacheKey, JSON.stringify({
        version: this.cacheKey,
        ts: Date.now(),
        settings: this.cache.settings,
        ads: this.cache.ads,
        analytics: this.cache.analytics
      }));
    } catch (error) {
      // Session cache is an optimization only.
    }
  },

  subscribe(ref, onValue) {
    if (!this.isAvailable()) return () => {};
    const unsubscribe = ref.onSnapshot(onValue, (error) => {
      console.warn('[FirestoreService] Realtime listener failed:', error.code || error.message);
    });
    this.unsubscribers.push(unsubscribe);
    return unsubscribe;
  },

  async startBaseRealtimeSync(context = this.getPageContext()) {
    if (!this.isAvailable()) return false;
    if (this.baseRealtimeStarted) return true;

    let startedAny = false;

    if (context.realtimeSettings) {
      startedAny = true;
      this.subscribe(this.db().collection('settings').doc('app'), (doc) => {
        if (doc.exists) {
          this.cache.settings = { ...this.defaults.settings, ...doc.data() };
          this.cacheLoadedAt.settings = Date.now();
          this.persistSessionCache();
          this.emitCacheEvent('settings');
        }
      });
    }

    if (context.realtimeAds) {
      startedAny = true;
      this.subscribe(this.db().collection('ads'), (snapshot) => {
        this.cache.ads = this.collectionToArray(snapshot);
        this.cacheLoadedAt.ads = Date.now();
        this.persistSessionCache();
        this.emitCacheEvent('ads');
      });
    }

    if (context.realtimeAnalytics) {
      startedAny = true;
      this.subscribe(this.db().collection('adAnalytics'), (snapshot) => {
        const analytics = {};
        snapshot.docs.forEach(doc => {
          analytics[doc.id] = this.docData(doc);
        });
        this.cache.analytics = analytics;
        this.cacheLoadedAt.analytics = Date.now();
        this.persistSessionCache();
        this.emitCacheEvent('analytics');
      });
    }

    this.baseRealtimeStarted = startedAny;
    return true;
  },

  async ensureSettings(force = false) {
    if (!this.isAvailable()) return this.getSettings();
    if (!force && this.cacheLoadedAt.settings && Date.now() - this.cacheLoadedAt.settings < this.cacheTtlMs) {
      return this.getSettings();
    }
    const doc = await this.db().collection('settings').doc('app').get();
    if (doc.exists) {
      this.cache.settings = { ...this.defaults.settings, ...doc.data() };
      this.cacheLoadedAt.settings = Date.now();
      this.persistSessionCache();
      this.emitCacheEvent('settings');
    }
    return this.getSettings();
  },

  async ensureAds(force = false) {
    if (!this.isAvailable()) return this.getAds();
    if (!force && this.cacheLoadedAt.ads && Date.now() - this.cacheLoadedAt.ads < this.cacheTtlMs) {
      return this.getAds();
    }
    const snapshot = await this.db().collection('ads').get();
    this.cache.ads = this.collectionToArray(snapshot);
    this.cacheLoadedAt.ads = Date.now();
    this.persistSessionCache();
    this.emitCacheEvent('ads');
    return this.getAds();
  },

  async ensureUsers(force = false) {
    if (!this.isAvailable()) return this.getUsers();
    if (!force && this.cacheLoadedAt.users && Date.now() - this.cacheLoadedAt.users < this.cacheTtlMs) {
      return this.getUsers();
    }
    const snapshot = await this.db().collection('users').limit(100).get();
    this.cache.users = this.collectionToArray(snapshot);
    this.cacheLoadedAt.users = Date.now();
    this.emitCacheEvent('users');
    return this.getUsers();
  },

  async ensureWithdrawals(force = false) {
    if (!this.isAvailable()) return this.getWithdrawals();
    if (!force && this.cacheLoadedAt.withdrawals && Date.now() - this.cacheLoadedAt.withdrawals < this.cacheTtlMs) {
      return this.getWithdrawals();
    }
    const snapshot = await this.db().collection('withdrawals').orderBy('date', 'desc').limit(100).get();
    this.cache.withdrawals = this.collectionToArray(snapshot);
    this.cacheLoadedAt.withdrawals = Date.now();
    this.emitCacheEvent('withdrawals');
    return this.getWithdrawals();
  },

  async ensureWithdrawalsForUser(userId, force = false) {
    if (!this.isAvailable() || !userId) return this.getWithdrawals();
    const cacheKey = `withdrawals:${userId}`;
    if (!force && this.cacheLoadedAt[cacheKey] && Date.now() - this.cacheLoadedAt[cacheKey] < this.cacheTtlMs) {
      return this.getWithdrawals().filter(item => item.userId === userId);
    }
    const snapshot = await this.db().collection('withdrawals').where('userId', '==', userId).get();
    const own = this.collectionToArray(snapshot);
    const others = this.cache.withdrawals.filter(item => item.userId !== userId);
    this.cache.withdrawals = [...own, ...others].sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
    this.cacheLoadedAt[cacheKey] = Date.now();
    this.emitCacheEvent('withdrawals');
    return own;
  },

  async ensureAnalytics(force = false) {
    if (!this.isAvailable()) return this.getAdAnalytics();
    if (!force && this.cacheLoadedAt.analytics && Date.now() - this.cacheLoadedAt.analytics < this.cacheTtlMs) {
      return this.getAdAnalytics();
    }
    const snapshot = await this.db().collection('adAnalytics').get();
    const analytics = {};
    snapshot.docs.forEach(doc => {
      analytics[doc.id] = this.docData(doc);
    });
    this.cache.analytics = analytics;
    this.cacheLoadedAt.analytics = Date.now();
    this.persistSessionCache();
    this.emitCacheEvent('analytics');
    return this.getAdAnalytics();
  },

  clearUserScopedRealtime() {
    this.userScopedUnsubscribers.forEach(unsubscribe => {
      try { unsubscribe(); } catch (error) {}
    });
    this.userScopedUnsubscribers = [];
    this.watchedScopeKey = null;
  },

  watchForUser(user) {
    if (!this.isAvailable() || !user || !user.id) return;
    const context = this.getPageContext();
    const scopeKey = `${user.id}:${user.role || 'user'}:${context.pageKey}`;
    if (this.watchedScopeKey === scopeKey && this.userScopedUnsubscribers.length > 0) return;

    this.clearUserScopedRealtime();
    this.watchedScopeKey = scopeKey;

    const add = (unsubscribe) => this.userScopedUnsubscribers.push(unsubscribe);

    add(this.db().collection('users').doc(user.id).onSnapshot((doc) => {
      if (!doc.exists) return;
      const profile = this.docData(doc);
      const others = this.cache.users.filter(item => item.id !== profile.id);
      this.cache.users = [profile, ...others];
      if (window.AuthService && typeof window.AuthService.setCurrentUserProfile === 'function') {
        window.AuthService.setCurrentUserProfile(profile);
      }
      this.emitCacheEvent('users');
    }, (error) => console.warn('[FirestoreService] User profile listener failed:', error.code || error.message)));

    if (context.isWalletPage || context.isDashboardPage) {
      add(this.db().collection('withdrawals').where('userId', '==', user.id).onSnapshot((snapshot) => {
        const own = this.collectionToArray(snapshot);
        const others = this.cache.withdrawals.filter(item => item.userId !== user.id);
        this.cache.withdrawals = [...own, ...others].sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
        this.emitCacheEvent('withdrawals');
      }, (error) => console.warn('[FirestoreService] User withdrawals listener failed:', error.code || error.message)));
    }

    if (context.isAdsPage) {
      add(this.db().collection('cooldowns').where('userId', '==', user.id).onSnapshot((snapshot) => {
        snapshot.docs.forEach(doc => {
          this.cache.cooldowns[doc.id] = this.docData(doc);
        });
        this.emitCacheEvent('cooldowns');
      }, (error) => console.warn('[FirestoreService] Cooldown listener failed:', error.code || error.message)));

      add(this.db().collection('activeRewards').where('userId', '==', user.id).onSnapshot((snapshot) => {
        snapshot.docs.forEach(doc => {
          this.cache.activeRewards[doc.id] = this.docData(doc);
        });
        this.emitCacheEvent('activeRewards');
      }, (error) => console.warn('[FirestoreService] Active reward listener failed:', error.code || error.message)));

      add(this.db().collection('tabLocks').where('userId', '==', user.id).onSnapshot((snapshot) => {
        snapshot.docs.forEach(doc => {
          this.cache.tabLocks[doc.id] = this.docData(doc);
        });
        this.emitCacheEvent('tabLocks');
      }, (error) => console.warn('[FirestoreService] Tab lock listener failed:', error.code || error.message)));
    }

    if (window.Auth?.isAdmin?.() && context.isAdminPage) {
      if (context.isAdminUsers || context.isAdminDashboard || context.isAdminWithdrawals) {
        add(this.db().collection('users').limit(100).onSnapshot((snapshot) => {
          this.cache.users = this.collectionToArray(snapshot);
          this.cacheLoadedAt.users = Date.now();
          this.emitCacheEvent('users');
        }, (error) => console.warn('[FirestoreService] Admin users listener failed:', error.code || error.message)));
      }

      if (context.isAdminWithdrawals || context.isAdminDashboard) {
        add(this.db().collection('withdrawals').orderBy('date', 'desc').limit(100).onSnapshot((snapshot) => {
          this.cache.withdrawals = this.collectionToArray(snapshot);
          this.cacheLoadedAt.withdrawals = Date.now();
          this.emitCacheEvent('withdrawals');
        }, (error) => console.warn('[FirestoreService] Admin withdrawals listener failed:', error.code || error.message)));
      }

      // Settings, ads and analytics are handled by the page-aware base listeners.
    }
  },

  getSettings() {
    return this.clone(this.cache.settings || this.defaults?.settings || {});
  },

  async saveSettings(settings) {
    this.cache.settings = this.clone(settings);
    this.cacheLoadedAt.settings = Date.now();
    this.persistSessionCache();
    this.emitCacheEvent('settings');
    if (!this.isAvailable()) return false;
    await this.db().collection('settings').doc('app').set({ ...settings, updatedAt: this.nowIso() }, { merge: false });
    return true;
  },

  getUsers() {
    return this.clone(this.cache.users || []);
  },

  getUserById(id) {
    return this.getUsers().find(user => user.id === id) || null;
  },

  async saveUsers(users) {
    this.cache.users = this.clone(users);
    this.cacheLoadedAt.users = Date.now();
    this.emitCacheEvent('users');
    if (!this.isAvailable()) return false;
    const batch = this.db().batch();
    users.forEach(user => batch.set(this.db().collection('users').doc(user.id), user, { merge: false }));
    await batch.commit();
    return true;
  },

  async createUserProfile(user) {
    const profile = {
      ...user,
      id: user.id,
      password: null
    };
    const existing = this.cache.users.filter(item => item.id !== profile.id);
    this.cache.users = [profile, ...existing];
    this.cacheLoadedAt.users = Date.now();
    this.emitCacheEvent('users');
    if (!this.isAvailable()) return profile;
    await this.db().collection('users').doc(profile.id).set(profile, { merge: false });
    return profile;
  },

  async updateUser(updatedUser) {
    const current = this.getUserById(updatedUser.id) || {};
    const nextUser = { ...current, ...updatedUser };
    this.cache.users = this.cache.users.map(user => user.id === nextUser.id ? nextUser : user);
    if (!this.cache.users.some(user => user.id === nextUser.id)) {
      this.cache.users.unshift(nextUser);
    }
    this.cacheLoadedAt.users = Date.now();
    this.emitCacheEvent('users');
    if (!this.isAvailable()) return true;
    await this.db().collection('users').doc(nextUser.id).set(nextUser, { merge: false });
    return true;
  },

  async addTimelineEvent(userId, type, message) {
    const user = this.getUserById(userId);
    if (!user) return false;
    const event = {
      id: this.generateUUID('timeline'),
      date: this.nowIso(),
      type,
      message
    };
    const timeline = [event, ...(user.timeline || [])].slice(0, 100);
    return this.updateUser({ ...user, timeline });
  },

  async addXP(userId, amount) {
    const user = this.getUserById(userId);
    if (!user) return false;
    const xp = (user.xp || 0) + amount;
    let level = 'Ø¨Ø±ÙˆÙ†Ø²ÙŠ';
    if (xp > 600) level = 'Ù…Ø§Ø³ÙŠ';
    else if (xp > 300) level = 'Ø°Ù‡Ø¨ÙŠ';
    else if (xp > 100) level = 'ÙØ¶ÙŠ';
    return this.updateUser({ ...user, xp, level });
  },

  getAds() {
    return this.clone(this.cache.ads || []);
  },

  getAdById(id) {
    return this.getAds().find(ad => ad.id === id) || null;
  },

  async saveAds(ads) {
    const nextAds = this.clone(ads);
    const previousIds = new Set((this.cache.ads || []).map(ad => ad.id));
    const nextIds = new Set(nextAds.map(ad => ad.id));
    this.cache.ads = nextAds;
    this.cacheLoadedAt.ads = Date.now();
    this.persistSessionCache();
    this.emitCacheEvent('ads');
    if (!this.isAvailable()) return false;

    const batch = this.db().batch();
    nextAds.forEach(ad => batch.set(this.db().collection('ads').doc(ad.id), ad, { merge: false }));
    previousIds.forEach(id => {
      if (!nextIds.has(id)) batch.delete(this.db().collection('ads').doc(id));
    });
    await batch.commit();
    return true;
  },

  async addAd(ad) {
    const newAd = {
      ...ad,
      id: ad.id || this.generateUUID('ad'),
      active: ad.active !== undefined ? ad.active : true,
      status: ad.status || 'active',
      isBroken: ad.isBroken !== undefined ? ad.isBroken : false,
      impressions: ad.impressions || 0,
      completedViews: ad.completedViews || 0,
      skippedViews: ad.skippedViews || 0,
      totalRewards: ad.totalRewards || 0,
      createdAt: ad.createdAt || this.nowIso()
    };
    this.cache.ads = [...this.cache.ads, newAd];
    this.cacheLoadedAt.ads = Date.now();
    this.persistSessionCache();
    this.emitCacheEvent('ads');
    if (this.isAvailable()) {
      await this.db().collection('ads').doc(newAd.id).set(newAd, { merge: false });
    }
    return newAd;
  },

  async updateAd(updatedAd) {
    const original = this.getAdById(updatedAd.id);
    if (!original) return false;
    const isActivating = updatedAd.active === true || original.active === true;
    const isRecovered = isActivating && (original.status === 'error' || original.isBroken);
    const nextAd = {
      ...original,
      ...updatedAd,
      status: isRecovered ? 'active' : (updatedAd.status || original.status),
      isBroken: isRecovered ? false : (updatedAd.isBroken !== undefined ? updatedAd.isBroken : original.isBroken),
      errorMessage: isRecovered ? '' : (updatedAd.errorMessage !== undefined ? updatedAd.errorMessage : original.errorMessage)
    };
    this.cache.ads = this.cache.ads.map(ad => ad.id === nextAd.id ? nextAd : ad);
    this.cacheLoadedAt.ads = Date.now();
    this.persistSessionCache();
    this.emitCacheEvent('ads');
    if (this.isAvailable()) {
      await this.db().collection('ads').doc(nextAd.id).set(nextAd, { merge: false });
    }
    return true;
  },

  async deleteAd(id) {
    this.cache.ads = this.cache.ads.filter(ad => ad.id !== id);
    this.cacheLoadedAt.ads = Date.now();
    this.persistSessionCache();
    this.emitCacheEvent('ads');
    if (this.isAvailable()) {
      await this.db().collection('ads').doc(id).delete();
      await this.db().collection('adAnalytics').doc(id).delete().catch(() => {});
    }
    return true;
  },

  async duplicateAd(id) {
    const ad = this.getAdById(id);
    if (!ad) return null;
    return this.addAd({
      ...ad,
      id: this.generateUUID('ad'),
      title: `${ad.title} - Ù†Ø³Ø®Ø©`,
      active: false,
      status: 'active',
      isBroken: false,
      errorMessage: '',
      impressions: 0,
      completedViews: 0,
      skippedViews: 0,
      totalRewards: 0,
      createdAt: this.nowIso()
    });
  },

  async markAdAsBroken(adId, errorMsg) {
    const ad = this.getAdById(adId);
    if (!ad) return false;
    await this.updateAd({
      ...ad,
      active: false,
      status: 'error',
      isBroken: true,
      errorMessage: errorMsg,
      skippedViews: (ad.skippedViews || 0) + 1
    });
    await this.incrementAdMetric(adId, 'skippedViews', 1);
    return true;
  },

  getAdAnalytics() {
    return this.clone(this.cache.analytics || {});
  },

  async saveAdAnalytics(analytics) {
    this.cache.analytics = this.clone(analytics || {});
    this.cacheLoadedAt.analytics = Date.now();
    this.persistSessionCache();
    this.emitCacheEvent('analytics');
    if (!this.isAvailable()) return false;
    const batch = this.db().batch();
    Object.entries(analytics || {}).forEach(([id, data]) => {
      batch.set(this.db().collection('adAnalytics').doc(id), { id, ...data }, { merge: false });
    });
    await batch.commit();
    return true;
  },

  ensureAnalyticsCache(adId) {
    if (!this.cache.analytics[adId]) {
      this.cache.analytics[adId] = {
        id: adId,
        impressions: 0,
        completedViews: 0,
        skippedViews: 0,
        totalRewards: 0,
        totalWatchTime: 0,
        averageWatchTime: 0,
        lastShownAt: null
      };
    }
  },

  async incrementAdMetric(adId, key, value = 1) {
    this.ensureAnalyticsCache(adId);
    const analytic = this.cache.analytics[adId];
    analytic[key] = key === 'totalRewards'
      ? +((analytic[key] || 0) + value).toFixed(2)
      : (analytic[key] || 0) + value;
    if (key === 'impressions') analytic.lastShownAt = this.nowIso();

    const ad = this.getAdById(adId);
    if (ad) {
      const nextValue = key === 'totalRewards'
        ? +((ad[key] || 0) + value).toFixed(2)
        : (ad[key] || 0) + value;
      this.cache.ads = this.cache.ads.map(item => item.id === adId ? { ...item, [key]: nextValue } : item);
    }
    this.cacheLoadedAt.ads = Date.now();
    this.cacheLoadedAt.analytics = Date.now();
    this.persistSessionCache();
    this.emitCacheEvent('ads');
    this.emitCacheEvent('analytics');

    if (!this.isAvailable()) return false;
    const update = { [key]: this.fv().increment(value) };
    if (key === 'impressions') update.lastShownAt = this.nowIso();
    await Promise.all([
      this.db().collection('adAnalytics').doc(adId).set({ id: adId, ...update }, { merge: true }),
      this.db().collection('ads').doc(adId).set(update, { merge: true })
    ]);
    return true;
  },

  async addWatchTime(adId, seconds) {
    this.ensureAnalyticsCache(adId);
    const analytic = this.cache.analytics[adId];
    analytic.totalWatchTime = (analytic.totalWatchTime || 0) + seconds;
    analytic.averageWatchTime = +(analytic.totalWatchTime / Math.max(1, analytic.completedViews || 1)).toFixed(1);

    if (!this.isAvailable()) return false;
    await this.db().runTransaction(async (tx) => {
      const ref = this.db().collection('adAnalytics').doc(adId);
      const snap = await tx.get(ref);
      const data = snap.exists ? snap.data() : { completedViews: 0, totalWatchTime: 0 };
      const totalWatchTime = (data.totalWatchTime || 0) + seconds;
      const averageWatchTime = +(totalWatchTime / Math.max(1, data.completedViews || 1)).toFixed(1);
      tx.set(ref, { id: adId, totalWatchTime, averageWatchTime }, { merge: true });
    });
    return true;
  },

  getWithdrawals() {
    return this.clone(this.cache.withdrawals || []);
  },

  async saveWithdrawals(withdrawals) {
    this.cache.withdrawals = this.clone(withdrawals);
    this.cacheLoadedAt.withdrawals = Date.now();
    this.emitCacheEvent('withdrawals');
    if (!this.isAvailable()) return false;
    const batch = this.db().batch();
    withdrawals.forEach(item => batch.set(this.db().collection('withdrawals').doc(item.id), item, { merge: false }));
    await batch.commit();
    return true;
  },

  async addWithdrawal(withdrawal) {
    const item = {
      ...withdrawal,
      id: withdrawal.id || this.generateUUID('withdraw'),
      date: withdrawal.date || this.nowIso(),
      status: 'pending',
      auditTrail: withdrawal.auditTrail || [{
        id: this.generateUUID('audit'),
        status: 'pending',
        date: this.nowIso(),
        note: 'ØªÙ… Ø¥Ù†Ø´Ø§Ø¡ Ø·Ù„Ø¨ Ø§Ù„Ø³Ø­Ø¨'
      }]
    };
    this.cache.withdrawals = [item, ...this.cache.withdrawals];
    this.cacheLoadedAt.withdrawals = Date.now();
    this.emitCacheEvent('withdrawals');
    if (this.isAvailable()) {
      await this.db().collection('withdrawals').doc(item.id).set(item, { merge: false });
    }
    return item;
  },

  async updateWithdrawalStatus(id, status) {
    if (!['approved', 'rejected'].includes(status)) return false;
    if (!window.BackendService || !window.BackendService.isAvailable()) {
      return false;
    }
    const serverResult = await window.BackendService.reviewWithdrawal({ withdrawalId: id, status });
    if (!serverResult || !serverResult.valid) {
      this.reportSecurityIncident('withdrawal-review-failed', {
        withdrawalId: id,
        status,
        message: serverResult?.reason || 'backend-unavailable'
      });
      return false;
    }
    if (serverResult.withdrawal) {
      this.cache.withdrawals = this.cache.withdrawals.map(item => item.id === id ? serverResult.withdrawal : item);
      if (!this.cache.withdrawals.some(item => item.id === id)) this.cache.withdrawals.unshift(serverResult.withdrawal);
    }
    if (serverResult.user) {
      this.cache.users = this.cache.users.map(item => item.id === serverResult.user.id ? serverResult.user : item);
    }
    this.cacheLoadedAt.withdrawals = Date.now();
    this.cacheLoadedAt.users = Date.now();
    this.emitCacheEvent('withdrawals');
    this.emitCacheEvent('users');
    window.AppAnalytics?.trackWithdrawStatus?.(serverResult.withdrawal || { id, amount: 0 }, status);
    return true;

    const withdrawal = this.cache.withdrawals.find(item => item.id === id);
    if (!withdrawal || withdrawal.status !== 'pending') return false;

    const updated = {
      ...withdrawal,
      status,
      reviewedAt: this.nowIso(),
      auditTrail: [
        ...(withdrawal.auditTrail || []),
        {
          id: this.generateUUID('audit'),
          status,
          date: this.nowIso(),
          note: status === 'approved' ? 'ØªÙ… Ù‚Ø¨ÙˆÙ„ Ø§Ù„Ø·Ù„Ø¨ Ù…Ù† Ù„ÙˆØ­Ø© Ø§Ù„Ø¥Ø¯Ø§Ø±Ø©' : 'ØªÙ… Ø±ÙØ¶ Ø§Ù„Ø·Ù„Ø¨ Ù…Ù† Ù„ÙˆØ­Ø© Ø§Ù„Ø¥Ø¯Ø§Ø±Ø©'
        }
      ]
    };
    const updateLocalUser = () => {
      const user = this.getUserById(withdrawal.userId);
      if (!user) return;
      const timelineEvent = {
        id: this.generateUUID('timeline'),
        date: this.nowIso(),
        type: status === 'approved' ? 'Ø³Ø­Ø¨' : 'Ø±ÙØ¶',
        message: `Ø·Ù„Ø¨ Ø³Ø­Ø¨ Ø¨Ù‚ÙŠÙ…Ø© ${Number(withdrawal.amount || 0).toFixed(2)} Ø¬Ù†ÙŠÙ‡ ${status === 'approved' ? 'ØªÙ…Øª Ø§Ù„Ù…ÙˆØ§ÙÙ‚Ø© Ø¹Ù„ÙŠÙ‡' : 'ØªÙ… Ø±ÙØ¶Ù‡'}`
      };
      const nextUser = {
        ...user,
        pendingWithdrawalId: null,
        timeline: [timelineEvent, ...(user.timeline || [])].slice(0, 100)
      };
      if (status === 'rejected') {
        nextUser.balance = +((user.balance || 0) + (Number(withdrawal.amount) || 0)).toFixed(2);
        nextUser.earnings = [
          {
            id: this.generateUUID('earn'),
            date: this.nowIso(),
            type: 'Ø¥Ø±Ø¬Ø§Ø¹ Ø·Ù„Ø¨ Ø³Ø­Ø¨ Ù…Ø±ÙÙˆØ¶',
            amount: Number(withdrawal.amount) || 0
          },
          ...(user.earnings || [])
        ].slice(0, 100);
      }
      this.cache.users = this.cache.users.map(item => item.id === nextUser.id ? nextUser : item);
    };

    const applyLocalUpdate = () => {
      this.cache.withdrawals = this.cache.withdrawals.map(item => item.id === id ? updated : item);
      updateLocalUser();
      this.cacheLoadedAt.withdrawals = Date.now();
      this.cacheLoadedAt.users = Date.now();
      this.emitCacheEvent('withdrawals');
      this.emitCacheEvent('users');
    };

    if (!this.isAvailable()) {
      applyLocalUpdate();
      return true;
    }

    try {
      await this.db().runTransaction(async (tx) => {
      const withdrawalRef = this.db().collection('withdrawals').doc(id);
      const userRef = this.db().collection('users').doc(withdrawal.userId);
      const [withdrawalSnap, userSnap] = await Promise.all([
        tx.get(withdrawalRef),
        tx.get(userRef)
      ]);
      if (!withdrawalSnap.exists) throw new Error('Ø·Ù„Ø¨ Ø§Ù„Ø³Ø­Ø¨ ØºÙŠØ± Ù…ÙˆØ¬ÙˆØ¯.');
      const freshWithdrawal = { id: withdrawalSnap.id, ...withdrawalSnap.data() };
      if (freshWithdrawal.status !== 'pending') throw new Error('ØªÙ…Øª Ù…Ø±Ø§Ø¬Ø¹Ø© Ù‡Ø°Ø§ Ø§Ù„Ø·Ù„Ø¨ Ø³Ø§Ø¨Ù‚Ø§.');

      tx.set(withdrawalRef, { ...freshWithdrawal, ...updated }, { merge: false });

      if (userSnap.exists) {
        const user = { id: userSnap.id, ...userSnap.data() };
        const timelineEvent = {
          id: this.generateUUID('timeline'),
          date: this.nowIso(),
          type: status === 'approved' ? 'Ø³Ø­Ø¨' : 'Ø±ÙØ¶',
          message: `Ø·Ù„Ø¨ Ø³Ø­Ø¨ Ø¨Ù‚ÙŠÙ…Ø© ${Number(freshWithdrawal.amount || 0).toFixed(2)} Ø¬Ù†ÙŠÙ‡ ${status === 'approved' ? 'ØªÙ…Øª Ø§Ù„Ù…ÙˆØ§ÙÙ‚Ø© Ø¹Ù„ÙŠÙ‡' : 'ØªÙ… Ø±ÙØ¶Ù‡'}`
        };
        const nextUser = {
          ...user,
          pendingWithdrawalId: null,
          timeline: [timelineEvent, ...(user.timeline || [])].slice(0, 100)
        };
        if (status === 'rejected') {
          nextUser.balance = +((user.balance || 0) + (Number(freshWithdrawal.amount) || 0)).toFixed(2);
          nextUser.earnings = [
            {
              id: this.generateUUID('earn'),
              date: this.nowIso(),
              type: 'Ø¥Ø±Ø¬Ø§Ø¹ Ø·Ù„Ø¨ Ø³Ø­Ø¨ Ù…Ø±ÙÙˆØ¶',
              amount: Number(freshWithdrawal.amount) || 0
            },
            ...(user.earnings || [])
          ].slice(0, 100);
        }
        tx.set(userRef, nextUser, { merge: false });
      }
      });
      applyLocalUpdate();
      return true;
    } catch (error) {
      this.reportSecurityIncident('withdrawal-review-failed', {
        withdrawalId: id,
        status,
        message: error.code || error.message
      });
      return false;
    }
  },

  hasPendingWithdrawal(userId) {
    return this.cache.withdrawals.some(item => item.userId === userId && item.status === 'pending');
  },

  async requestWithdrawal(user, withdrawal) {
    if (!user || !user.id || !withdrawal) {
      return { valid: false, reason: 'Ø¨ÙŠØ§Ù†Ø§Øª Ø·Ù„Ø¨ Ø§Ù„Ø³Ø­Ø¨ ØºÙŠØ± Ù…ÙƒØªÙ…Ù„Ø©.' };
    }

    if (!window.BackendService || !window.BackendService.isAvailable()) {
      return { valid: false, reason: 'Render Backend ØºÙŠØ± Ù…ØªØ§Ø­Ø© Ø­Ø§Ù„ÙŠØ§ Ù„Ø¥Ø±Ø³Ø§Ù„ Ø·Ù„Ø¨ Ø§Ù„Ø³Ø­Ø¨ Ø¨Ø£Ù…Ø§Ù†.' };
    }
    const serverResult = await window.BackendService.requestWithdrawal(withdrawal);
    if (!serverResult || !serverResult.valid) {
      return { valid: false, reason: serverResult?.reason || 'ØªØ¹Ø°Ø± Ø¥Ø±Ø³Ø§Ù„ Ø·Ù„Ø¨ Ø§Ù„Ø³Ø­Ø¨.' };
    }
    if (serverResult.withdrawal) {
      this.cache.withdrawals = [serverResult.withdrawal, ...this.cache.withdrawals.filter(item => item.id !== serverResult.withdrawal.id)];
      this.cacheLoadedAt.withdrawals = Date.now();
      this.emitCacheEvent('withdrawals');
    }
    if (serverResult.user) {
      this.cache.users = this.cache.users.map(item => item.id === serverResult.user.id ? serverResult.user : item);
      this.cacheLoadedAt.users = Date.now();
      this.emitCacheEvent('users');
      if (window.AuthService?.setCurrentUserProfile && serverResult.user.id === user.id) {
        window.AuthService.setCurrentUserProfile(serverResult.user);
      }
    }
    window.AppAnalytics?.trackWithdrawRequest?.(serverResult.withdrawal || withdrawal);
    return { valid: true, withdrawal: serverResult.withdrawal, user: serverResult.user };

    const requestedAmount = Number(withdrawal.amount);
    if (!Number.isFinite(requestedAmount) || requestedAmount <= 0) {
      return { valid: false, reason: 'Ù‚ÙŠÙ…Ø© Ø§Ù„Ø³Ø­Ø¨ ØºÙŠØ± ØµØ­ÙŠØ­Ø©.' };
    }
    const amount = +requestedAmount.toFixed(2);

    if (this.hasPendingWithdrawal(user.id) || user.pendingWithdrawalId) {
      return { valid: false, reason: 'Ù„Ø¯ÙŠÙƒ Ø·Ù„Ø¨ Ø³Ø­Ø¨ Ù‚ÙŠØ¯ Ø§Ù„Ù…Ø±Ø§Ø¬Ø¹Ø© Ø¨Ø§Ù„ÙØ¹Ù„.' };
    }

    const item = {
      ...withdrawal,
      id: withdrawal.id || this.generateUUID('withdraw'),
      userId: user.id,
      userName: withdrawal.userName || user.name,
      amount,
      date: withdrawal.date || this.nowIso(),
      status: 'pending',
      auditTrail: withdrawal.auditTrail || [{
        id: this.generateUUID('audit'),
        status: 'pending',
        date: this.nowIso(),
        note: 'ØªÙ… Ø¥Ù†Ø´Ø§Ø¡ Ø·Ù„Ø¨ Ø§Ù„Ø³Ø­Ø¨'
      }]
    };

    const buildUserAfterRequest = (baseUser) => ({
      ...baseUser,
      balance: +((baseUser.balance || 0) - amount).toFixed(2),
      pendingWithdrawalId: item.id,
      lastWithdrawalId: item.id,
      lastWithdrawalAt: this.nowIso(),
      earnings: [
        {
          id: this.generateUUID('earn'),
          date: this.nowIso(),
          type: 'Ø·Ù„Ø¨ Ø³Ø­Ø¨',
          amount: -amount
        },
        ...(baseUser.earnings || [])
      ].slice(0, 100),
      timeline: [
        {
          id: this.generateUUID('timeline'),
          date: this.nowIso(),
          type: 'Ø³Ø­Ø¨',
          message: `ØªÙ… ØªÙ‚Ø¯ÙŠÙ… Ø·Ù„Ø¨ Ø³Ø­Ø¨ Ø¨Ù‚ÙŠÙ…Ø© ${amount.toFixed(2)} Ø¬Ù†ÙŠÙ‡ Ø¹Ø¨Ø± ${item.methodLabel || item.method || 'ÙˆØ³ÙŠÙ„Ø© Ø§Ù„Ø³Ø­Ø¨'}`
        },
        ...(baseUser.timeline || [])
      ].slice(0, 100)
    });

    if ((user.balance || 0) < amount) {
      return { valid: false, reason: 'Ø±ØµÙŠØ¯Ùƒ Ø§Ù„Ø­Ø§Ù„ÙŠ ØºÙŠØ± ÙƒØ§Ù Ù„Ø¥ØªÙ…Ø§Ù… Ø¹Ù…Ù„ÙŠØ© Ø§Ù„Ø³Ø­Ø¨.' };
    }

    if (!this.isAvailable()) {
      const updatedUser = buildUserAfterRequest(user);
      this.cache.withdrawals = [item, ...this.cache.withdrawals];
      this.cacheLoadedAt.withdrawals = Date.now();
      this.emitCacheEvent('withdrawals');
      await this.updateUser(updatedUser);
      return { valid: true, withdrawal: item, user: updatedUser };
    }

    try {
      const result = await this.db().runTransaction(async (tx) => {
        const userRef = this.db().collection('users').doc(user.id);
        const withdrawalRef = this.db().collection('withdrawals').doc(item.id);
        const [userSnap, withdrawalSnap] = await Promise.all([
          tx.get(userRef),
          tx.get(withdrawalRef)
        ]);

        if (!userSnap.exists) throw new Error('Ø­Ø³Ø§Ø¨ Ø§Ù„Ù…Ø³ØªØ®Ø¯Ù… ØºÙŠØ± Ù…ÙˆØ¬ÙˆØ¯.');
        if (withdrawalSnap.exists) throw new Error('Ø·Ù„Ø¨ Ø§Ù„Ø³Ø­Ø¨ Ù…ÙˆØ¬ÙˆØ¯ Ø¨Ø§Ù„ÙØ¹Ù„.');

        const freshUser = { id: userSnap.id, ...userSnap.data() };
        if (freshUser.pendingWithdrawalId) throw new Error('Ù„Ø¯ÙŠÙƒ Ø·Ù„Ø¨ Ø³Ø­Ø¨ Ù‚ÙŠØ¯ Ø§Ù„Ù…Ø±Ø§Ø¬Ø¹Ø© Ø¨Ø§Ù„ÙØ¹Ù„.');
        if ((freshUser.balance || 0) < amount) throw new Error('Ø±ØµÙŠØ¯Ùƒ Ø§Ù„Ø­Ø§Ù„ÙŠ ØºÙŠØ± ÙƒØ§Ù Ù„Ø¥ØªÙ…Ø§Ù… Ø¹Ù…Ù„ÙŠØ© Ø§Ù„Ø³Ø­Ø¨.');

        const updatedUser = buildUserAfterRequest(freshUser);
        tx.set(withdrawalRef, item, { merge: false });
        tx.set(userRef, updatedUser, { merge: false });
        return { withdrawal: item, user: updatedUser };
      });

      this.cache.withdrawals = [result.withdrawal, ...this.cache.withdrawals.filter(item => item.id !== result.withdrawal.id)];
      this.cache.users = this.cache.users.map(item => item.id === result.user.id ? result.user : item);
      this.cacheLoadedAt.withdrawals = Date.now();
      this.cacheLoadedAt.users = Date.now();
      this.emitCacheEvent('withdrawals');
      this.emitCacheEvent('users');
      return { valid: true, withdrawal: result.withdrawal, user: result.user };
    } catch (error) {
      return { valid: false, reason: error.message };
    }
  },

  async setCooldown(userId, seconds) {
    const record = {
      id: userId,
      userId,
      until: Date.now() + seconds * 1000,
      seconds,
      updatedAt: this.nowIso()
    };
    this.cache.cooldowns[userId] = record;
    if (this.isAvailable()) {
      await this.db().collection('cooldowns').doc(userId).set(record, { merge: false });
    }
    return record;
  },

  getRemainingCooldown(userId) {
    const record = this.cache.cooldowns[userId];
    if (!record) return 0;
    return Math.max(0, Math.ceil((record.until - Date.now()) / 1000));
  },

  async setActiveRewardLock(userId, lock) {
    const record = { id: userId, userId, ...lock, updatedAt: this.nowIso() };
    this.cache.activeRewards[userId] = record;
    if (this.isAvailable()) {
      await this.db().collection('activeRewards').doc(userId).set(record, { merge: false });
    }
    return record;
  },

  getActiveRewardLock(userId) {
    const record = this.cache.activeRewards[userId];
    if (!record) return null;
    if (record.expiresAt <= Date.now()) {
      delete this.cache.activeRewards[userId];
      if (this.isAvailable()) this.db().collection('activeRewards').doc(userId).delete().catch(() => {});
      return null;
    }
    return this.clone(record);
  },

  async setTabLock(userId, lock) {
    const record = { id: userId, userId, ...lock, updatedAt: this.nowIso() };
    this.cache.tabLocks[userId] = record;
    if (this.isAvailable()) {
      await this.db().collection('tabLocks').doc(userId).set(record, { merge: false }).catch(() => {});
    }
    return record;
  },

  getTabLock(userId) {
    const record = this.cache.tabLocks[userId];
    if (!record) return null;
    if (record.expiresAt <= Date.now()) {
      delete this.cache.tabLocks[userId];
      if (this.isAvailable()) this.db().collection('tabLocks').doc(userId).delete().catch(() => {});
      return null;
    }
    return this.clone(record);
  },

  async releaseTabLock(userId, tabId) {
    const record = this.cache.tabLocks[userId];
    if (record && record.tabId && record.tabId !== tabId) return;
    delete this.cache.tabLocks[userId];
    if (this.isAvailable()) {
      await this.db().collection('tabLocks').doc(userId).delete().catch(() => {});
    }
  },

  async clearActiveRewardLock(userId) {
    delete this.cache.activeRewards[userId];
    if (this.isAvailable()) {
      await this.db().collection('activeRewards').doc(userId).delete().catch(() => {});
    }
  },

  async createRewardSessionRecord(session) {
    if (!session || !session.id) return false;
    if (this.isAvailable()) {
      await this.db().collection('rewardSessions').doc(session.id).set({
        ...session,
        createdAt: this.nowIso(),
        status: 'started'
      }, { merge: false }).catch(error => {
        console.warn('[FirestoreService] Reward session write failed:', error.code || error.message);
      });
    }
    return true;
  },

  async addRewardClaim(session) {
    if (!session || !session.id) return false;
    if (!this.isAvailable()) return true;
    await this.db().collection('rewardClaims').doc(session.id).set({
      id: session.id,
      userId: session.userId,
      adId: session.adId,
      claimedAt: this.nowIso()
    }, { merge: false });
    return true;
  },

  async claimReward({ user, ad, session, elapsedSeconds }) {
    if (!user || !ad || !session) {
      return { valid: false, reason: 'Ø¬Ù„Ø³Ø© Ø§Ù„Ù…ÙƒØ§ÙØ£Ø© ØºÙŠØ± Ù…ÙƒØªÙ…Ù„Ø©.' };
    }

    if (!window.BackendService || !window.BackendService.isAvailable()) {
      return { valid: false, reason: 'Render Backend ØºÙŠØ± Ù…ØªØ§Ø­Ø© Ø­Ø§Ù„ÙŠØ§ Ù„Ø§Ø­ØªØ³Ø§Ø¨ Ø§Ù„Ù…ÙƒØ§ÙØ£Ø© Ø¨Ø£Ù…Ø§Ù†.' };
    }
    const serverResult = await window.BackendService.claimReward({
      sessionId: session.id,
      adId: ad.id,
      elapsedSeconds,
      visibilityStats: session.visibilityStats || {
        hiddenEvents: session.hiddenEvents || 0,
        focusEvents: session.focusEvents || 0,
        pauseMs: session.pauseMs || 0
      },
      fingerprint: session.fingerprintHash || window.Security?.getFingerprintHash?.()
    });
    if (!serverResult || !serverResult.valid) {
      return { valid: false, reason: serverResult?.reason || 'ØªÙ… Ø±ÙØ¶ Ø§Ù„Ù…ÙƒØ§ÙØ£Ø© Ù…Ù† Ø§Ù„Ø³ÙŠØ±ÙØ±.' };
    }
    if (serverResult.user) {
      this.cache.users = this.cache.users.map(item => item.id === serverResult.user.id ? serverResult.user : item);
      this.cacheLoadedAt.users = Date.now();
      this.emitCacheEvent('users');
      if (window.AuthService?.setCurrentUserProfile && serverResult.user.id === user.id) {
        window.AuthService.setCurrentUserProfile(serverResult.user);
      }
    }
    this.emitCacheEvent('analytics');
    return { valid: true, user: serverResult.user };

    const earnedPoints = Number(ad.reward) || 0;
    const today = new Date().toISOString().split('T')[0];
    const earning = {
      id: this.generateUUID('earn'),
      date: this.nowIso(),
      type: `Ù…Ø´Ø§Ù‡Ø¯Ø© Ø¥Ø¹Ù„Ø§Ù†: ${ad.title}`,
      amount: earnedPoints
    };
    const timelineEvent = {
      id: this.generateUUID('timeline'),
      date: this.nowIso(),
      type: 'Ù…Ø´Ø§Ù‡Ø¯Ø©',
      message: `Ø´Ø§Ù‡Ø¯Øª Ø¥Ø¹Ù„Ø§Ù† "${String(ad.title || '').substring(0, 30)}..." ÙˆØ­ØµÙ„Øª Ø¹Ù„Ù‰ +${earnedPoints.toFixed(2)} Ø¬Ù†ÙŠÙ‡ ÙˆÙ…ÙƒØ§ÙØ£Ø© Ø§Ù„Ø®Ø¨Ø±Ø© +10 XP`
    };

    const computeUser = (baseUser) => {
      const isNewWatchDay = baseUser.lastWatchDate !== today;
      const nextXp = (baseUser.xp || 0) + 10;
      let level = baseUser.level || 'Ø¨Ø±ÙˆÙ†Ø²ÙŠ';
      if (nextXp > 600) level = 'Ù…Ø§Ø³ÙŠ';
      else if (nextXp > 300) level = 'Ø°Ù‡Ø¨ÙŠ';
      else if (nextXp > 100) level = 'ÙØ¶ÙŠ';
      return {
        ...baseUser,
        balance: +((baseUser.balance || 0) + earnedPoints).toFixed(2),
        totalViews: (baseUser.totalViews || 0) + 1,
        todayViews: (isNewWatchDay ? 0 : (baseUser.todayViews || 0)) + 1,
        lastWatchDate: today,
        lastDailyResetAt: isNewWatchDay ? this.nowIso() : (baseUser.lastDailyResetAt || this.nowIso()),
        lastRewardSessionId: session.id,
        lastRewardAt: this.nowIso(),
        xp: nextXp,
        level,
        earnings: [earning, ...(baseUser.earnings || [])].slice(0, 100),
        timeline: [timelineEvent, ...(baseUser.timeline || [])].slice(0, 100)
      };
    };

    if (!this.isAvailable()) {
      const updatedUser = computeUser(user);
      await this.updateUser(updatedUser);
      await this.incrementAdMetric(ad.id, 'completedViews', 1);
      await this.incrementAdMetric(ad.id, 'totalRewards', earnedPoints);
      await this.addWatchTime(ad.id, elapsedSeconds || session.duration || 0);
      await this.addRewardClaim(session);
      return { valid: true, user: updatedUser };
    }

    try {
      const result = await this.db().runTransaction(async (tx) => {
        const userRef = this.db().collection('users').doc(user.id);
        const adRef = this.db().collection('ads').doc(ad.id);
        const analyticsRef = this.db().collection('adAnalytics').doc(ad.id);
        const claimRef = this.db().collection('rewardClaims').doc(session.id);
        const cooldownRef = this.db().collection('cooldowns').doc(user.id);

        const [userSnap, adSnap, claimSnap, cooldownSnap] = await Promise.all([
          tx.get(userRef),
          tx.get(adRef),
          tx.get(claimRef),
          tx.get(cooldownRef)
        ]);

        if (claimSnap.exists) throw new Error('ØªÙ… Ø§Ø³ØªØ®Ø¯Ø§Ù… Ø¬Ù„Ø³Ø© Ø§Ù„Ù…ÙƒØ§ÙØ£Ø© Ù‡Ø°Ù‡ Ø³Ø§Ø¨Ù‚Ù‹Ø§.');
        if (!userSnap.exists) throw new Error('Ø­Ø³Ø§Ø¨ Ø§Ù„Ù…Ø³ØªØ®Ø¯Ù… ØºÙŠØ± Ù…ÙˆØ¬ÙˆØ¯.');
        if (!adSnap.exists) throw new Error('Ø§Ù„Ø¥Ø¹Ù„Ø§Ù† ØºÙŠØ± Ù…ÙˆØ¬ÙˆØ¯.');

        const freshUser = { id: userSnap.id, ...userSnap.data() };
        const freshAd = { id: adSnap.id, ...adSnap.data() };
        if (!freshAd.active || freshAd.status === 'error' || freshAd.isBroken) {
          throw new Error('Ø§Ù„Ø¥Ø¹Ù„Ø§Ù† ØºÙŠØ± Ù†Ø´Ø· Ø£Ùˆ Ù…Ø¹Ø·ÙˆØ¨.');
        }
        if (cooldownSnap.exists && cooldownSnap.data().until > Date.now()) {
          throw new Error('ÙØªØ±Ø© Ø§Ù„ØªÙ‡Ø¯Ø¦Ø© Ù„Ù… ØªÙ†ØªÙ‡ Ø¨Ø¹Ø¯.');
        }

        const updatedUser = computeUser(freshUser);
        tx.set(userRef, updatedUser, { merge: false });
        tx.set(claimRef, {
          id: session.id,
          userId: user.id,
          adId: ad.id,
          rewardAmount: earnedPoints,
          claimedAt: this.nowIso(),
          elapsedSeconds: Number(elapsedSeconds) || 0
        }, { merge: false });
        tx.set(cooldownRef, {
          id: user.id,
          userId: user.id,
          until: Date.now() + (this.getSettings().cooldownBetweenAds || 5) * 1000,
          seconds: this.getSettings().cooldownBetweenAds || 5,
          updatedAt: this.nowIso()
        }, { merge: false });
        tx.set(analyticsRef, {
          id: ad.id,
          completedViews: this.fv().increment(1),
          totalRewards: this.fv().increment(earnedPoints),
          totalWatchTime: this.fv().increment(Number(elapsedSeconds) || 0),
          averageWatchTime: Number(elapsedSeconds) || 0,
          lastRewardSessionId: session.id
        }, { merge: true });
        tx.set(adRef, {
          completedViews: this.fv().increment(1),
          totalRewards: this.fv().increment(earnedPoints),
          lastRewardSessionId: session.id
        }, { merge: true });
        return updatedUser;
      });

      this.cache.users = this.cache.users.map(item => item.id === result.id ? result : item);
      this.cacheLoadedAt.users = Date.now();
      this.emitCacheEvent('users');
      this.emitCacheEvent('analytics');
      await this.clearActiveRewardLock(user.id);
      return { valid: true, user: result };
    } catch (error) {
      return { valid: false, reason: error.message };
    }
  },

  async reportSecurityIncident(type, detail = {}) {
    const incident = {
      id: this.generateUUID('incident'),
      type,
      detail,
      date: this.nowIso()
    };
    if (this.isAvailable()) {
      await this.db().collection('securityIncidents').doc(incident.id).set(incident).catch(() => {});
    }
    return incident;
  },

  async migrateLocalStorageToFirestore() {
    if (!this.isAvailable()) throw new Error('Firebase is not configured.');
    const parse = (key, fallback) => {
      try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch (_) { return fallback; }
    };

    const settings = parse('ap_settings', this.defaults.settings);
    const users = parse('ap_users', []);
    const ads = parse('ap_ads', []);
    const withdrawals = parse('ap_withdrawals', []);
    const analytics = parse('ap_ad_analytics', {});

    await this.saveSettings(settings);
    await this.saveUsers(users.map(user => ({ ...user, password: null })));
    await this.saveAds(ads);
    await this.saveWithdrawals(withdrawals);
    await this.saveAdAnalytics(analytics);

    return {
      users: users.length,
      ads: ads.length,
      withdrawals: withdrawals.length,
      analytics: Object.keys(analytics).length
    };
  }
};

window.FirestoreService = FirestoreService;

