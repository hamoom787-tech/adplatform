/* ============================================================
   register-page.js - Register form UI wiring
   ============================================================ */

'use strict';

document.addEventListener('DOMContentLoaded', () => {
  const settings = window.StorageDB.getSettings();
  const form = document.getElementById('register-form');
  const submitBtn = document.getElementById('submit-btn');
  if (!form || !submitBtn) return;

  if (!settings.registrationEnabled) {
    window.App.showToast('عذرًا، تم إيقاف التسجيلات الجديدة مؤقتًا من قبل الإدارة', 'warning');
    submitBtn.disabled = true;
    submitBtn.textContent = 'التسجيل معطل حاليًا';
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const name = document.getElementById('name').value.trim();
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    const confirmPassword = document.getElementById('confirm-password').value;

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      window.App.showToast('يرجى إدخال بريد إلكتروني صحيح وصالح', 'error');
      return;
    }

    if (password.length < 6) {
      window.App.showToast('يجب أن تكون كلمة المرور 6 أحرف على الأقل', 'error');
      return;
    }

    if (password !== confirmPassword) {
      window.App.showToast('كلمتا المرور غير متطابقتين', 'error');
      return;
    }

    window.App.setLoading(submitBtn, true);

    try {
      const user = await window.Auth.register(name, email, password);
      window.AppAnalytics?.trackRegister(user);
      window.App.showToast('تم إنشاء حسابك بنجاح وحصلت على 5.00 جنيه!', 'success');
      setTimeout(() => {
        window.location.href = 'dashboard.html';
      }, 1000);
    } catch (error) {
      const message = window.Auth?.friendlyAuthError
        ? window.Auth.friendlyAuthError(error)
        : error.message;
      window.App.showToast(message, 'error');
      window.App.setLoading(submitBtn, false);
    }
  });
});
