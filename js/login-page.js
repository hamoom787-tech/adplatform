/* ============================================================
   login-page.js - Login form UI wiring
   ============================================================ */

'use strict';

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('login-form');
  const submitBtn = document.getElementById('submit-btn');
  if (!form || !submitBtn) return;

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value.trim();
    const rememberMe = document.getElementById('remember-me').checked;

    window.App.setLoading(submitBtn, true);

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      window.App.showToast('يرجى إدخال بريد إلكتروني صحيح وصالح', 'error');
      window.App.setLoading(submitBtn, false);
      return;
    }

    try {
      const user = await window.Auth.login(email, password, rememberMe);
      window.AppAnalytics?.trackLogin(user);
      window.App.showToast(`أهلاً بك مجددًا ${user.name}`, 'success');
      setTimeout(() => {
        window.location.href = window.Auth?.isAdmin?.() ? 'admin/index.html' : 'dashboard.html';
      }, 800);
    } catch (error) {
      const message = window.Auth?.friendlyAuthError
        ? window.Auth.friendlyAuthError(error)
        : error.message;
      window.App.showToast(message, 'error');
      window.App.setLoading(submitBtn, false);
    }
  });
});
