/* ============================================================
   backend-config.js - Render backend endpoint configuration
   ============================================================ */

'use strict';

window.ADPLATFORM_BACKEND_URL = window.ADPLATFORM_BACKEND_URL
  || window.API_BASE_URL
  || window.AppConfig?.API_BASE_URL
  || localStorage.getItem('ap_backend_url')
  || 'https://adplatform-backend.onrender.com';
