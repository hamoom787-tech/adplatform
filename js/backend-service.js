/* ============================================================
   backend-service.js - Render REST API bridge
   ============================================================ */

'use strict';

const BackendService = {
  get baseUrl() {
    const raw = window.ADPLATFORM_BACKEND_URL || localStorage.getItem('ap_backend_url') || '';
    return String(raw).replace(/\/+$/, '');
  },

  get vastProxyEndpoint() {
    return `${this.baseUrl}/vast/proxy`;
  },

  isAvailable() {
    return !!this.baseUrl;
  },

  async authHeaders() {
    const user = window.FirebaseService?.auth?.currentUser;
    if (!user || typeof user.getIdToken !== 'function') {
      throw new Error('يجب تسجيل الدخول أولا.');
    }
    const token = await user.getIdToken();
    return { Authorization: `Bearer ${token}` };
  },

  async request(path, { method = 'GET', body = null, auth = true } = {}) {
    if (!this.isAvailable()) {
      throw new Error('Render Backend URL غير مضبوط. عدل js/backend-config.js بعد نشر backend على Render.');
    }
    const headers = {
      Accept: 'application/json'
    };
    if (body !== null) headers['Content-Type'] = 'application/json';
    if (auth) Object.assign(headers, await this.authHeaders());

    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: body === null ? undefined : JSON.stringify(body),
      credentials: 'omit'
    });

    const contentType = response.headers.get('content-type') || '';
    const payload = contentType.includes('application/json')
      ? await response.json().catch(() => null)
      : await response.text().catch(() => '');

    if (!response.ok) {
      const message = payload?.error?.message || payload?.message || String(payload || `HTTP ${response.status}`);
      const error = new Error(message);
      error.status = response.status;
      error.payload = payload;
      throw error;
    }

    return payload;
  },

  normalizeError(error, fallback = 'تعذر تنفيذ العملية من السيرفر.') {
    return String(error?.message || error?.payload?.error?.message || fallback);
  },

  async startRewardSession({ adId, fingerprintHash, tabId }) {
    try {
      return await this.request('/rewards/start-session', {
        method: 'POST',
        body: { adId, fingerprintHash, tabId }
      });
    } catch (error) {
      return { valid: false, reason: this.normalizeError(error, 'تعذر إنشاء جلسة مشاهدة آمنة.') };
    }
  },

  async claimReward({ sessionId, adId, elapsedSeconds, visibilityStats, fingerprint }) {
    try {
      return await this.request('/rewards/claim', {
        method: 'POST',
        body: { sessionId, adId, elapsedSeconds, visibilityStats, fingerprint }
      });
    } catch (error) {
      return { valid: false, reason: this.normalizeError(error, 'تم رفض احتساب المكافأة من السيرفر.') };
    }
  },

  async requestWithdrawal(withdrawal) {
    try {
      return await this.request('/withdrawals/request', {
        method: 'POST',
        body: withdrawal || {}
      });
    } catch (error) {
      return { valid: false, reason: this.normalizeError(error, 'تعذر إنشاء طلب السحب.') };
    }
  },

  async reviewWithdrawal({ withdrawalId, status, note }) {
    try {
      return await this.request('/withdrawals/review', {
        method: 'POST',
        body: { withdrawalId, status, note }
      });
    } catch (error) {
      return { valid: false, reason: this.normalizeError(error, 'تعذر مراجعة طلب السحب.') };
    }
  },

  async setUserClaims({ uid, admin = false, moderator = false }) {
    try {
      return await this.request('/admin/set-claims', {
        method: 'POST',
        body: { uid, admin, moderator }
      });
    } catch (error) {
      return { valid: false, reason: this.normalizeError(error, 'تعذر تحديث صلاحيات المستخدم.') };
    }
  },

  vastProxyUrl(url) {
    return `${this.vastProxyEndpoint}?url=${encodeURIComponent(String(url || ''))}`;
  }
};

window.BackendService = BackendService;
