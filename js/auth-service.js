/* ============================================================
   auth-service.js - Firebase Authentication and auth guards
   ============================================================ */

'use strict';

const AuthService = {
  currentUser: null,
  firebaseUser: null,
  claims: {},
  authReadyResolver: null,
  authReadyPromise: null,

  init() {
    this.authReadyPromise = new Promise(resolve => {
      this.authReadyResolver = resolve;
    });

    if (!this.isAvailable()) {
      console.warn('[AuthService] Firebase Auth is not configured. Authentication is disabled until setup is complete.');
      this.authReadyResolver(null);
      return;
    }

    window.FirebaseService.auth.onAuthStateChanged(async (firebaseUser) => {
      this.firebaseUser = firebaseUser;
      if (!firebaseUser) {
        this.currentUser = null;
        this.claims = {};
        if (window.FirestoreService) window.FirestoreService.clearUserScopedRealtime();
        this.authReadyResolver(null);
        return;
      }

      const profile = await this.loadProfile(firebaseUser.uid);
      this.claims = await this.loadClaims(false);
      this.currentUser = profile ? { ...profile, claims: this.claims } : null;
      if (window.FirestoreService) window.FirestoreService.watchForUser(profile);
      this.authReadyResolver(this.currentUser);
    }, (error) => {
      console.warn('[AuthService] Auth state listener failed:', error.code || error.message);
      this.authReadyResolver(null);
    });
  },

  isAvailable() {
    return !!(window.FirebaseService && window.FirebaseService.isAvailable && window.FirebaseService.auth);
  },

  ready() {
    return this.authReadyPromise || Promise.resolve(this.currentUser);
  },

  setCurrentUserProfile(profile) {
    if (!profile) return;
    this.currentUser = { ...profile, claims: this.claims || profile.claims || {} };
  },

  async loadClaims(force = false) {
    const user = window.FirebaseService?.auth?.currentUser;
    if (!user || typeof user.getIdTokenResult !== 'function') return {};
    const token = await user.getIdTokenResult(force);
    this.claims = token.claims || {};
    if (window.AdminService) {
      window.AdminService.claims = this.claims;
      window.AdminService.lastLoadedAt = Date.now();
    }
    return this.claims;
  },

  async loadProfile(uid) {
    if (!window.FirestoreService || !window.FirestoreService.isAvailable()) {
      return null;
    }

    const doc = await window.FirestoreService.db().collection('users').doc(uid).get();
    if (!doc.exists) {
      const fallbackProfile = this.buildUserProfile({
        uid,
        email: this.firebaseUser?.email || '',
        displayName: this.firebaseUser?.displayName || ''
      });
      await window.FirestoreService.createUserProfile(fallbackProfile);
      return fallbackProfile;
    }

    return { id: doc.id, ...doc.data() };
  },

  buildUserProfile(firebaseUser, overrides = {}) {
    const today = new Date().toISOString().split('T')[0];
    const name = overrides.name || firebaseUser.displayName || (firebaseUser.email ? firebaseUser.email.split('@')[0] : 'عضو جديد');
    return {
      id: firebaseUser.uid,
      name,
      email: firebaseUser.email || overrides.email || '',
      password: null,
      role: overrides.role || 'user',
      balance: overrides.balance !== undefined ? overrides.balance : 5.00,
      pendingBalance: overrides.pendingBalance || 0,
      chargebackDebt: overrides.chargebackDebt || 0,
      totalViews: overrides.totalViews || 0,
      todayViews: overrides.todayViews || 0,
      xp: overrides.xp || 0,
      level: overrides.level || 'برونزي',
      status: overrides.status || 'active',
      joinDate: overrides.joinDate || new Date().toISOString(),
      lastWatchDate: overrides.lastWatchDate || today,
      lastDailyResetAt: overrides.lastDailyResetAt || new Date().toISOString(),
      pendingWithdrawalId: overrides.pendingWithdrawalId || null,
      lastWithdrawalId: overrides.lastWithdrawalId || null,
      lastWithdrawalAt: overrides.lastWithdrawalAt || null,
      lastRewardSessionId: overrides.lastRewardSessionId || null,
      lastRewardAt: overrides.lastRewardAt || null,
      earnings: overrides.earnings || [
        {
          id: window.FirestoreService.generateUUID('earn'),
          date: new Date().toISOString(),
          type: 'مكافأة تسجيل',
          amount: 5.00
        }
      ],
      timeline: overrides.timeline || [
        {
          id: window.FirestoreService.generateUUID('timeline'),
          date: new Date().toISOString(),
          type: 'هدية',
          message: 'حصلت على مكافأة تسجيل ترحيبية بقيمة 5.00 جنيه'
        },
        {
          id: window.FirestoreService.generateUUID('timeline'),
          date: new Date().toISOString(),
          type: 'عضوية',
          message: 'تم إنشاء الحساب بنجاح، مرحباً بك في منصة ربحي'
        }
      ]
    };
  },

  async register(name, email, password) {
    if (!this.isAvailable()) {
      throw new Error('Firebase غير مهيأ. ضع firebaseConfig أولاً داخل js/firebase.js.');
    }

    if (window.FirestoreService?.ensureSettings) {
      await window.FirestoreService.ensureSettings();
    }
    const settings = window.StorageDB.getSettings();
    if (!settings.registrationEnabled) {
      throw new Error('تسجيل الحسابات الجديدة معطل حالياً من قبل الإدارة');
    }

    const cleanName = String(name || '').trim();
    const cleanEmail = String(email || '').trim().toLowerCase();
    if (!cleanName || !cleanEmail || !password) {
      throw new Error('يرجى إدخال جميع بيانات التسجيل المطلوبة');
    }
    if (/[<>]/.test(cleanName) || /[<>]/.test(cleanEmail)) {
      throw new Error('لا يمكن استخدام رموز HTML داخل بيانات الحساب');
    }

    const auth = window.FirebaseService.auth;
    await auth.setPersistence(window.firebase.auth.Auth.Persistence.SESSION);
    const credential = await auth.createUserWithEmailAndPassword(cleanEmail, password);
    await credential.user.updateProfile({ displayName: cleanName });

    const profile = this.buildUserProfile({
      uid: credential.user.uid,
      email: cleanEmail,
      displayName: cleanName
    });

    await window.FirestoreService.createUserProfile(profile);
    this.claims = await this.loadClaims(true);
    this.currentUser = { ...profile, claims: this.claims };
    window.FirestoreService.watchForUser(profile);
    return this.currentUser;
  },

  async login(email, password, rememberMe = false) {
    if (!this.isAvailable()) {
      throw new Error('Firebase غير مهيأ. ضع firebaseConfig أولاً داخل js/firebase.js.');
    }

    const auth = window.FirebaseService.auth;
    const persistence = rememberMe
      ? window.firebase.auth.Auth.Persistence.LOCAL
      : window.firebase.auth.Auth.Persistence.SESSION;
    await auth.setPersistence(persistence);

    const credential = await auth.signInWithEmailAndPassword(String(email || '').trim().toLowerCase(), String(password || '').trim());
    const profile = await this.loadProfile(credential.user.uid);

    if (!profile) {
      await auth.signOut();
      throw new Error('تعذر تحميل بيانات الحساب من Firestore.');
    }

    if (profile.status === 'banned') {
      await auth.signOut();
      throw new Error('تم إيقاف هذا الحساب من قبل الإدارة');
    }

    this.claims = await this.loadClaims(true);
    this.currentUser = { ...profile, claims: this.claims };
    window.FirestoreService.watchForUser(profile);
    if (!this.isAdmin()) {
      window.FirestoreService.addTimelineEvent(profile.id, 'دخول', 'تم تسجيل الدخول بنجاح إلى المنصة').catch(() => {});
    }
    return this.currentUser;
  },

  async logout() {
    this.currentUser = null;
    if (window.FirestoreService) window.FirestoreService.clearUserScopedRealtime();
    if (this.isAvailable()) {
      await window.FirebaseService.auth.signOut();
    }
    const path = window.location.pathname.toLowerCase();
    const isAdminPage = path.includes('/admin/');
    window.location.href = isAdminPage ? '../login.html' : 'login.html';
  },

  getCurrentUser() {
    return this.currentUser;
  },

  refreshSession() {
    const user = this.getCurrentUser();
    if (!user) return null;
    const updated = window.StorageDB.getUserById(user.id) || user;
    if (updated.status === 'banned') {
      window.Router?.forceLogout();
      return null;
    }
    this.currentUser = { ...updated, claims: this.claims || user.claims || {} };
    return this.currentUser;
  },

  isAdmin() {
    return this.claims?.admin === true || this.currentUser?.claims?.admin === true;
  },

  requireRole(role) {
    const user = this.getCurrentUser();
    if (role === 'admin') return this.isAdmin();
    if (role === 'moderator') return this.isAdmin() || this.claims?.moderator === true || user?.claims?.moderator === true;
    return !!user && user.role === role;
  },

  friendlyAuthError(error) {
    const code = error?.code || '';
    const message = String(error?.message || '');

    if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') {
      return 'البريد الإلكتروني أو كلمة المرور غير صحيحة. تأكد من نسخ البيانات بدون مسافات زائدة.';
    }
    if (code === 'auth/email-already-in-use') {
      return 'هذا البريد مسجل بالفعل. استخدم تسجيل الدخول بدل إنشاء حساب جديد.';
    }
    if (code === 'auth/weak-password') {
      return 'كلمة المرور ضعيفة. استخدم 6 أحرف على الأقل ويفضل إضافة أرقام وحروف.';
    }
    if (code === 'auth/too-many-requests') {
      return 'تم حظر المحاولات مؤقتًا بسبب كثرة المحاولات. انتظر قليلًا ثم حاول مرة أخرى.';
    }
    if (code === 'auth/configuration-not-found') {
      return 'Firebase Authentication غير مفعّل بالكامل. فعّل Email/Password من Firebase Console.';
    }
    if (message) return message;
    return 'تعذر إتمام عملية المصادقة الآن.';
  }
};

AuthService.init();
window.AuthService = AuthService;
window.Auth = AuthService;
