/* ============================================================
   storage.js — نظام محاكاة قاعدة البيانات المحلية والبيانات الافتراضية
   ============================================================ */

'use strict';

const STORAGE_VERSION = '1.0.0';

// البيانات الافتراضية كاحتياط للتوافق التام (خصوصاً لبروتوكول file://)
const FALLBACK_DEFAULTS = {
  settings: {
    version: STORAGE_VERSION,
    registrationEnabled: true,
    withdrawalsEnabled: true,
    earnPerView: 0.50,
    adDuration: 15, // بالثواني
    minWithdraw: 50,
    maxDailyViews: 10,
    cooldownBetweenAds: 5 // بالثواني
  },
  ads: [
    { 
      id: 'ad-1', 
      title: 'عرض حصري على التسوق الإلكتروني لشهر مايو', 
      category: 'تجارة', 
      duration: 15, 
      reward: 0.50, 
      active: true, 
      type: 'html', 
      code: '<div style="padding: 30px; text-align: center; background: linear-gradient(135deg, #1e1e38 0%, #2a2a50 100%); color: #fff; border-radius: 12px; border: 1px dashed rgba(255,255,255,0.15); font-family: Cairo, sans-serif;"><h3 style="margin-bottom:12px;color:#00ffc4;">🛍️ متجر التسوق الذكي</h3><p style="font-size:14px;color:#a7a9be;">استخدم كود الخصم <strong>SAVE50</strong> عند إتمام الشراء لتوفير 50% من قيمة مشترياتك!</p><a href="#" onclick="return false;" style="display:inline-block;margin-top:16px;padding:8px 20px;background:#6c63ff;color:#fff;border-radius:6px;text-decoration:none;font-weight:600;font-size:13px;">تصفح المنتجات الآن</a></div>', 
      description: 'احصل على خصم 50% على جميع المنتجات الفاخرة لفترة محدودة.',
      status: 'active',
      isBroken: false,
      impressions: 0,
      completedViews: 0,
      skippedViews: 0,
      totalRewards: 0,
      createdAt: new Date('2026-05-01T12:00:00.000Z').toISOString()
    },
    { 
      id: 'ad-2', 
      title: 'تعلم البرمجة وتطوير الويب مجانًا خطوة بخطوة', 
      category: 'تعليم', 
      duration: 15, 
      reward: 0.50, 
      active: true, 
      type: 'iframe', 
      code: 'https://example.com', 
      description: 'دورة شاملة لتعلم البرمجيات وبناء المواقع من الصفر.',
      status: 'active',
      isBroken: false,
      impressions: 0,
      completedViews: 0,
      skippedViews: 0,
      totalRewards: 0,
      createdAt: new Date('2026-05-02T12:00:00.000Z').toISOString()
    },
    { 
      id: 'ad-3', 
      title: 'تطبيق التوصيل السريع - اطلب الآن ووفر 50%', 
      category: 'خدمات', 
      duration: 15, 
      reward: 0.75, 
      active: true, 
      type: 'html', 
      code: '<div style="padding: 24px; text-align: center; background: rgba(0,212,170,0.05); color: #fff; border: 1px solid rgba(0,212,170,0.2); border-radius: 12px; font-family: Cairo, sans-serif;"><h4 style="color:#00d4aa;margin-bottom:8px;">🚚 التوصيل السريع للمنازل</h4><p style="font-size:13px;color:#a7a9be;">اطلب وجبتك المفضلة وسنقوم بتوصيلها مجاناً لأول طلب فقط.</p></div>', 
      description: 'خدمة التوصيل الأسرع في مدينتك لجميع المطاعم والصيدليات.',
      status: 'active',
      isBroken: false,
      impressions: 0,
      completedViews: 0,
      skippedViews: 0,
      totalRewards: 0,
      createdAt: new Date('2026-05-03T12:00:00.000Z').toISOString()
    },
    { 
      id: 'ad-4', 
      title: 'أفضل عروض السفر الصيفية للفنادق والرحلات', 
      category: 'سياحة', 
      duration: 20, 
      reward: 1.00, 
      active: true, 
      type: 'html', 
      code: '<div style="padding: 30px; text-align: center; background: #1a1a2e; color: #fff; border-radius: 12px; border: 1px solid rgba(255,255,255,0.1); font-family: Cairo, sans-serif;"><h3 style="color:#ffb347;">✈️ عروض الصيف الذهبية</h3><p style="font-size:13px;color:#a7a9be;">خصم يصل إلى 35% على حجوزات الفنادق والرحلات الدولية.</p></div>', 
      description: 'خطط لعطلتك الصيفية مع باقات السفر الشاملة بأسعار مخفضة.',
      status: 'active',
      isBroken: false,
      impressions: 0,
      completedViews: 0,
      skippedViews: 0,
      totalRewards: 0,
      createdAt: new Date('2026-05-04T12:00:00.000Z').toISOString()
    },
    { 
      id: 'ad-5', 
      title: 'منصة الاستثمار والتداول الذكي للأصول الرقمية', 
      category: 'مال', 
      duration: 30, 
      reward: 1.50, 
      active: true, 
      type: 'script', 
      code: 'document.getElementById("script-ad-container").innerHTML = `<div style="padding:32px;text-align:center;background:rgba(255,107,107,0.05);border:1px solid rgba(255,107,107,0.2);border-radius:12px;color:white;font-family:sans-serif;"><h3 style="color:#ff6b6b;margin-bottom:12px;">📈 منصة التداول الذكي</h3><p style="font-size:14px;color:#a7a9be;">ابدأ استثمارك اليوم بـ 10$ فقط واحصل على أدوات تحليل مجانية.</p></div>`;', 
      description: 'استثمر بذكاء في الأصول والعملات الرقمية مع تحليلات فنية فورية.',
      status: 'active',
      isBroken: false,
      impressions: 0,
      completedViews: 0,
      skippedViews: 0,
      totalRewards: 0,
      createdAt: new Date('2026-05-05T12:00:00.000Z').toISOString()
    }
  ],
  users: [],
  withdrawals: []
};

// ──────────────────────────────────────────────────────────────
// مولد المعرفات الفريدة
// ──────────────────────────────────────────────────────────────
function generateUUID(prefix = 'id') {
  const rand = Math.random().toString(36).substring(2, 10);
  const time = Date.now().toString(36);
  return `${prefix}-${rand}-${time}`;
}

// ──────────────────────────────────────────────────────────────
// تهيئة وإدارة النسخ (Data Versioning)
// ──────────────────────────────────────────────────────────────
const StorageDB = {
  // Expose generateUUID to external scripts
  generateUUID(prefix = 'id') {
    return window.FirestoreService
      ? window.FirestoreService.generateUUID(prefix)
      : generateUUID(prefix);
  },

  read(key, fallback) {
    if (window.FirestoreService) {
      if (key === 'ap_settings') return window.FirestoreService.getSettings();
      if (key === 'ap_users') return window.FirestoreService.getUsers();
      if (key === 'ap_ads') return window.FirestoreService.getAds();
      if (key === 'ap_withdrawals') return window.FirestoreService.getWithdrawals();
      if (key === 'ap_ad_analytics') return window.FirestoreService.getAdAnalytics();
    }
    return fallback;
  },

  write(key, value) {
    if (!window.FirestoreService) {
      return;
    }
    if (key === 'ap_settings') return window.FirestoreService.saveSettings(value).catch(() => false);
    if (key === 'ap_users') return window.FirestoreService.saveUsers(value).catch(() => false);
    if (key === 'ap_ads') return window.FirestoreService.saveAds(value).catch(() => false);
    if (key === 'ap_withdrawals') return window.FirestoreService.saveWithdrawals(value).catch(() => false);
    if (key === 'ap_ad_analytics') return window.FirestoreService.saveAdAnalytics(value).catch(() => false);
    return Promise.resolve(false);
  },

  init() {
    if (window.FirestoreService) {
      window.FirestoreService.init(FALLBACK_DEFAULTS);
    }
  },

  seedDatabase(data) {
    if (!window.FirestoreService) return;
    window.FirestoreService.saveSettings(data.settings).catch(() => {});
    window.FirestoreService.saveUsers((data.users || []).map(user => ({ ...user, password: null }))).catch(() => {});
    window.FirestoreService.saveAds(data.ads || []).catch(() => {});
    window.FirestoreService.saveWithdrawals(data.withdrawals || []).catch(() => {});
    window.FirestoreService.saveAdAnalytics({}).catch(() => {});
  },

  migrateDatabase(fromVersion, toVersion) {
    return { fromVersion, toVersion };
  },

  normalizeDatabase() {
    const settings = { ...FALLBACK_DEFAULTS.settings, ...this.getSettings() };
    this.saveSettings(settings);

    const ads = this.getAds().map(ad => ({
      type: 'html',
      status: ad.active === false ? 'disabled' : 'active',
      isBroken: false,
      impressions: 0,
      completedViews: 0,
      skippedViews: 0,
      totalRewards: 0,
      createdAt: new Date().toISOString(),
      ...ad
    }));
    this.saveAds(ads);

    const withdrawals = this.getWithdrawals().map(w => ({
      status: 'pending',
      methodKey: this.inferWithdrawMethodKey(w.method),
      methodLabel: w.method || 'وسيلة غير محددة',
      auditTrail: [],
      ...w
    }));
    this.saveWithdrawals(withdrawals);
  },

  inferWithdrawMethodKey(method) {
    const text = String(method || '').toLowerCase();
    if (text.includes('vodafone') || text.includes('فودافون')) return 'vodafone_cash';
    if (text.includes('orange') || text.includes('اورنج') || text.includes('أورنج')) return 'orange_cash';
    if (text.includes('etisalat') || text.includes('اتصالات')) return 'etisalat_cash';
    if (text.includes('we')) return 'we_cash';
    if (text.includes('instapay') || text.includes('إنستاباي') || text.includes('انستاباي')) return 'instapay';
    return 'custom';
  },

  // ── دوال الإعدادات ──
  getSettings() {
    return this.read('ap_settings', FALLBACK_DEFAULTS.settings);
  },

  saveSettings(settings) {
    this.write('ap_settings', settings);
  },

  // ── دوال المستخدمين ──
  getUsers() {
    return this.read('ap_users', []);
  },

  saveUsers(users) {
    this.write('ap_users', users);
  },

  getUserById(id) {
    return this.getUsers().find(u => u.id === id) || null;
  },

  updateUser(updatedUser) {
    const existing = this.getUserById(updatedUser.id);
    if (!existing) return false;

    const nextUser = { ...existing, ...updatedUser };
    if (window.FirestoreService && typeof window.FirestoreService.updateUser === 'function') {
      window.FirestoreService.updateUser(nextUser).catch(() => {});
    }

    const current = window.Auth ? window.Auth.getCurrentUser() : null;
    if (current && current.id === updatedUser.id) {
      if (window.AuthService && typeof window.AuthService.setCurrentUserProfile === 'function') {
        window.AuthService.setCurrentUserProfile({ ...nextUser });
      }
    }
    return true;
  },

  // إضافة حدث للخط الزمني
  addTimelineEvent(userId, type, message) {
    const user = this.getUserById(userId);
    if (!user) return;
    const timeline = user.timeline ? [...user.timeline] : [];
    timeline.unshift({
      id: generateUUID('timeline'),
      date: new Date().toISOString(),
      type,
      message
    });
    this.updateUser({ ...user, timeline });
  },

  // إضافة XP ونظام المستوى
  addXP(userId, amount) {
    const user = this.getUserById(userId);
    if (!user) return;
    const xp = (user.xp || 0) + amount;
    
    let newLevel = 'برونزي';
    if (xp > 600) {
      newLevel = 'ماسي';
    } else if (xp > 300) {
      newLevel = 'ذهبي';
    } else if (xp > 100) {
      newLevel = 'فضي';
    }

    const oldLevel = user.level || 'برونزي';
    const levelChanged = oldLevel !== newLevel;

    const updatedUser = { ...user, xp, level: newLevel };
    this.updateUser(updatedUser);

    if (levelChanged) {
      this.addTimelineEvent(userId, 'ترقية', `مبروك! تم ترقية مستواك من المستوى ${oldLevel} إلى المستوى ${newLevel}`);
    }
  },

  // ── دوال الإعلانات ──
  getAds() {
    return this.read('ap_ads', []);
  },

  saveAds(ads) {
    this.write('ap_ads', ads);
  },

  getAdById(id) {
    return this.getAds().find(a => a.id === id) || null;
  },

  addAd(ad) {
    const ads = this.getAds();
    const newAd = {
      ...ad,
      id: ad.id || generateUUID('ad'),
      active: ad.active !== undefined ? ad.active : true,
      status: ad.status || 'active',
      isBroken: ad.isBroken !== undefined ? ad.isBroken : false,
      impressions: ad.impressions || 0,
      completedViews: ad.completedViews || 0,
      skippedViews: ad.skippedViews || 0,
      totalRewards: ad.totalRewards || 0,
      createdAt: ad.createdAt || new Date().toISOString()
    };
    
    // Save atomically via array spread copy
    const updatedAds = [...ads.map(a => ({ ...a })), newAd];
    this.saveAds(updatedAds);
    return newAd;
  },

  updateAd(updatedAd) {
    const ads = this.getAds();
    const idx = ads.findIndex(a => a.id === updatedAd.id);
    if (idx !== -1) {
      // Broken Ad Recovery: if re-enabling or saving a previously broken ad, restore status and isBroken
      const originalAd = ads[idx];
      const isActivating = updatedAd.active === true || originalAd.active === true;
      const isRecovered = isActivating && (originalAd.status === 'error' || originalAd.isBroken);
      
      const newAd = {
        ...originalAd,
        ...updatedAd,
        status: isRecovered ? 'active' : (updatedAd.status || originalAd.status),
        isBroken: isRecovered ? false : (updatedAd.isBroken !== undefined ? updatedAd.isBroken : originalAd.isBroken),
        errorMessage: isRecovered ? '' : (updatedAd.errorMessage !== undefined ? updatedAd.errorMessage : originalAd.errorMessage)
      };

      // Atomically map to construct a new array
      const updatedAds = ads.map(a => a.id === updatedAd.id ? newAd : { ...a });
      this.saveAds(updatedAds);
      return true;
    }
    return false;
  },

  deleteAd(id) {
    const ads = this.getAds();
    const updatedAds = ads.filter(a => a.id !== id).map(a => ({ ...a }));
    this.saveAds(updatedAds);
  },

  duplicateAd(id) {
    const ads = this.getAds();
    const ad = ads.find(a => a.id === id);
    if (!ad) return null;
    const duplicated = {
      ...ad,
      id: generateUUID('ad'),
      title: ad.title + ' - نسخة',
      active: false,
      status: 'active',
      isBroken: false,
      errorMessage: '',
      impressions: 0,
      completedViews: 0,
      skippedViews: 0,
      totalRewards: 0,
      createdAt: new Date().toISOString()
    };
    const updatedAds = [...ads.map(a => ({ ...a })), duplicated];
    this.saveAds(updatedAds);
    return duplicated;
  },

  markAdAsBroken(adId, errorMsg) {
    const ads = this.getAds();
    const idx = ads.findIndex(a => a.id === adId);
    if (idx !== -1) {
      const updatedAds = ads.map(a => {
        if (a.id === adId) {
          return {
            ...a,
            active: false,
            status: 'error',
            isBroken: true,
            errorMessage: errorMsg,
            skippedViews: (a.skippedViews || 0) + 1
          };
        }
        return { ...a };
      });
      this.saveAds(updatedAds);
      return true;
    }
    return false;
  },

  getAdAnalytics() {
    return this.read('ap_ad_analytics', {});
  },

  saveAdAnalytics(analytics) {
    this.write('ap_ad_analytics', analytics);
  },

  initAdAnalytics(adId) {
    const analytics = this.getAdAnalytics();
    if (!analytics[adId]) {
      analytics[adId] = {
        impressions: 0,
        completedViews: 0,
        skippedViews: 0,
        totalRewards: 0,
        totalWatchTime: 0,
        averageWatchTime: 0,
        lastShownAt: null
      };
      this.saveAdAnalytics(analytics);
    }
  },

  incrementAdMetric(adId, key, value = 1) {
    if (window.FirestoreService && typeof window.FirestoreService.incrementAdMetric === 'function') {
      return window.FirestoreService.incrementAdMetric(adId, key, value).catch(() => false);
    }

    this.initAdAnalytics(adId);
    const analytics = this.getAdAnalytics();
    if (analytics[adId]) {
      const updatedAnalytic = { ...analytics[adId] };
      if (key === 'totalRewards') {
        updatedAnalytic[key] = +(updatedAnalytic[key] + value).toFixed(2);
      } else {
        updatedAnalytic[key] += value;
      }
      if (key === 'impressions') {
        updatedAnalytic.lastShownAt = new Date().toISOString();
      }
      
      const updatedAnalytics = {
        ...analytics,
        [adId]: updatedAnalytic
      };
      this.saveAdAnalytics(updatedAnalytics);
    }

    // Also update directly on the Ad object to satisfy structure requirements atomically
    const ads = this.getAds();
    const idx = ads.findIndex(a => a.id === adId);
    if (idx !== -1) {
      const updatedAds = ads.map(a => {
        if (a.id === adId) {
          const newAd = { ...a };
          if (newAd[key] === undefined) newAd[key] = 0;
          if (key === 'totalRewards') {
            newAd[key] = +(newAd[key] + value).toFixed(2);
          } else {
            newAd[key] += value;
          }
          return newAd;
        }
        return { ...a };
      });
      this.saveAds(updatedAds);
    }
  },

  addWatchTime(adId, seconds) {
    if (window.FirestoreService && typeof window.FirestoreService.addWatchTime === 'function') {
      return window.FirestoreService.addWatchTime(adId, seconds).catch(() => false);
    }

    this.initAdAnalytics(adId);
    const analytics = this.getAdAnalytics();
    if (analytics[adId]) {
      const updatedAnalytic = { ...analytics[adId] };
      if (!updatedAnalytic.totalWatchTime) {
        updatedAnalytic.totalWatchTime = 0;
      }
      updatedAnalytic.totalWatchTime += seconds;
      const views = updatedAnalytic.completedViews || 1;
      updatedAnalytic.averageWatchTime = +(updatedAnalytic.totalWatchTime / views).toFixed(1);
      
      const updatedAnalytics = {
        ...analytics,
        [adId]: updatedAnalytic
      };
      this.saveAdAnalytics(updatedAnalytics);
    }
  },

  // ── دوال عمليات السحب ──
  getWithdrawals() {
    return this.read('ap_withdrawals', []);
  },

  saveWithdrawals(withdrawals) {
    this.write('ap_withdrawals', withdrawals);
  },

  addWithdrawal(w) {
    const withdrawals = this.getWithdrawals();
    const methodKey = w.methodKey || this.inferWithdrawMethodKey(w.method || w.methodLabel);
    const methodLabels = {
      vodafone_cash: 'Vodafone Cash',
      orange_cash: 'Orange Cash',
      etisalat_cash: 'Etisalat Cash',
      we_cash: 'WE Pay / WE Cash',
      instapay: 'InstaPay'
    };
    const newWithdrawal = {
      ...w,
      methodKey,
      methodLabel: w.methodLabel || methodLabels[methodKey] || w.method || 'وسيلة غير محددة',
      method: w.method || w.methodLabel || methodLabels[methodKey] || 'وسيلة غير محددة',
      id: generateUUID('withdraw'),
      date: new Date().toISOString(),
      status: 'pending',
      auditTrail: [
        {
          id: generateUUID('audit'),
          status: 'pending',
          date: new Date().toISOString(),
          note: 'تم إنشاء طلب السحب'
        }
      ]
    };
    withdrawals.unshift(newWithdrawal);
    this.saveWithdrawals(withdrawals);
    return newWithdrawal;
  },

  updateWithdrawalStatus(id, status) {
    if (!['approved', 'rejected'].includes(status)) return false;
    if (window.FirestoreService && typeof window.FirestoreService.updateWithdrawalStatus === 'function') {
      return window.FirestoreService.updateWithdrawalStatus(id, status);
    }
    const withdrawals = this.getWithdrawals();
    const idx = withdrawals.findIndex(w => w.id === id);
    if (idx !== -1) {
      const original = withdrawals[idx];
      if (original.status !== 'pending') {
        return false;
      }
      const updatedWithdrawal = {
        ...original,
        status,
        reviewedAt: new Date().toISOString(),
        auditTrail: [
          ...(original.auditTrail || []),
          {
            id: generateUUID('audit'),
            status,
            date: new Date().toISOString(),
            note: status === 'approved' ? 'تم قبول الطلب من لوحة الإدارة' : 'تم رفض الطلب من لوحة الإدارة'
          }
        ]
      };
      const updatedWithdrawals = withdrawals.map(w => w.id === id ? updatedWithdrawal : { ...w });
      this.saveWithdrawals(updatedWithdrawals);

      // إضافة إشعار وحدث للمستخدم
      const user = this.getUserById(original.userId);
      if (user) {
        const statusText = status === 'approved' ? 'تمت الموافقة عليه' : 'تم رفضه';
        const type = status === 'approved' ? 'سحب' : 'رفض';
        this.addTimelineEvent(original.userId, type, `طلب سحب بقيمة ${original.amount.toFixed(2)} جنيه ${statusText}`);
      }
      return true;
    }
    return false;
  },

  hasPendingWithdrawal(userId) {
    return this.getWithdrawals().some(w => w.userId === userId && w.status === 'pending');
  },

  requestWithdrawal(user, withdrawal) {
    if (window.FirestoreService && typeof window.FirestoreService.requestWithdrawal === 'function') {
      return window.FirestoreService.requestWithdrawal(user, withdrawal);
    }
    return Promise.resolve({ valid: false, reason: 'FirestoreService غير متاح.' });
  },

  claimReward(payload) {
    if (window.FirestoreService && typeof window.FirestoreService.claimReward === 'function') {
      return window.FirestoreService.claimReward(payload);
    }
    return Promise.resolve({ valid: false, reason: 'FirestoreService غير متاح.' });
  }
};

// تهيئة قاعدة البيانات مباشرة عند تضمين الملف
StorageDB.init();
window.StorageDB = StorageDB;

