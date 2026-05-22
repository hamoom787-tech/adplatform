/* ============================================================
   config.js - إعدادات التشغيل العامة للواجهة
   ============================================================ */

'use strict';

(function setupAppConfig() {
  const host = String(window.location.hostname || '');
  const isDevelopment = ['localhost', '127.0.0.1', '::1'].includes(host);
  const storageOverride = localStorage.getItem('ap_backend_url');
  const productionBackendUrl = 'https://adplatform-backend.onrender.com';
  const developmentBackendUrl = 'http://localhost:8080';

  const config = {
    ENV: isDevelopment ? 'development' : 'production',
    API_BASE_URL: storageOverride || (isDevelopment ? developmentBackendUrl : productionBackendUrl),
    FRONTEND_URL: window.location.origin
  };

  window.AppConfig = Object.freeze(config);
  window.API_BASE_URL = config.API_BASE_URL;
})();
