/* ============================================================
   admin-service.js - custom-claims based admin protection
   ============================================================ */

'use strict';

const AdminService = {
  claims: {},
  lastLoadedAt: 0,
  ttlMs: 2 * 60 * 1000,

  async loadClaims(force = false) {
    const auth = window.FirebaseService && window.FirebaseService.auth;
    const user = auth && auth.currentUser;
    if (!user) {
      this.claims = {};
      return this.claims;
    }
    if (!force && this.lastLoadedAt && Date.now() - this.lastLoadedAt < this.ttlMs) {
      return this.claims;
    }
    const token = await user.getIdTokenResult(force);
    this.claims = token.claims || {};
    this.lastLoadedAt = Date.now();
    return this.claims;
  },

  async refreshClaims() {
    return this.loadClaims(true);
  },

  isAdminSync() {
    return this.claims && this.claims.admin === true;
  },

  isModeratorSync() {
    return this.isAdminSync() || (this.claims && this.claims.moderator === true);
  },

  async isAdmin(force = false) {
    const claims = await this.loadClaims(force);
    return claims.admin === true;
  },

  async isModerator(force = false) {
    const claims = await this.loadClaims(force);
    return claims.admin === true || claims.moderator === true;
  },

  async requireAdminPage() {
    if (window.Auth && typeof window.Auth.ready === 'function') {
      await window.Auth.ready();
    }
    const ok = await this.isAdmin(true);
    if (!ok) {
      if (window.App && typeof window.App.showToast === 'function') {
        window.App.showToast('غير مصرح بالدخول إلى لوحة الإدارة.', 'error');
      }
      window.Router?.redirect?.('../dashboard.html');
      return false;
    }
    return true;
  }
};

window.AdminService = AdminService;
