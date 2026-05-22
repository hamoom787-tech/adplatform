/* ============================================================
   dashboard.js — منطق لوحة تحكم المستخدم وإحصائيات الحساب والمحفظة
   ============================================================ */

'use strict';

const Dashboard = {
  withdrawMethods: {
    vodafone_cash: {
      label: 'Vodafone Cash',
      prefix: '010',
      placeholder: '01012345678',
      help: 'أدخل رقم محفظة Vodafone Cash المكون من 11 رقمًا ويبدأ بـ 010.'
    },
    orange_cash: {
      label: 'Orange Cash',
      prefix: '012',
      placeholder: '01212345678',
      help: 'أدخل رقم محفظة Orange Cash المكون من 11 رقمًا ويبدأ بـ 012.'
    },
    etisalat_cash: {
      label: 'Etisalat Cash',
      prefix: '011',
      placeholder: '01112345678',
      help: 'أدخل رقم محفظة Etisalat Cash المكون من 11 رقمًا ويبدأ بـ 011.'
    },
    we_cash: {
      label: 'WE Pay / WE Cash',
      prefix: '015',
      placeholder: '01512345678',
      help: 'أدخل رقم محفظة WE Pay / WE Cash المكون من 11 رقمًا ويبدأ بـ 015.'
    },
    instapay: {
      label: 'InstaPay',
      placeholder: 'username@instapay',
      help: 'أدخل عنوان InstaPay/IPN بدون مسافات، مثل username@instapay.'
    }
  },

  async init() {
    if (window.Auth && typeof window.Auth.ready === 'function') {
      await window.Auth.ready();
    }
    const user = window.Auth.getCurrentUser();
    if (!user) return;

    const path = window.location.pathname.toLowerCase();
    if (window.FirestoreService?.ensureSettings) {
      await window.FirestoreService.ensureSettings();
    }
    if (window.FirestoreService?.ensureWithdrawalsForUser) {
      await window.FirestoreService.ensureWithdrawalsForUser(user.id);
    }

    // التحقق من الصفحة التي نتواجد بها حالياً
    if (path.includes('wallet.html')) {
      this.initWallet(user);
    } else if (path.includes('dashboard.html') || path.endsWith('/')) {
      this.checkDailyReset(user);
      this.renderStats(user);
      this.renderXPProgress(user);
      this.renderEarnings(user);
      this.renderTimeline(user);
      this.setupWatchButton(user);
    }
  },

  // ──────────────────────────────────────────────────────────────
  // التحقق من إعادة تعيين عدد المشاهدات اليومية عند دخول يوم جديد
  // ──────────────────────────────────────────────────────────────
  checkDailyReset(user) {
    const today = new Date().toISOString().split('T')[0];
    if (user.lastWatchDate !== today) {
      user.todayViews = 0;
      user.lastWatchDate = today;
      if (window.AuthService && typeof window.AuthService.setCurrentUserProfile === 'function') {
        window.AuthService.setCurrentUserProfile({ ...user });
      }
    }
  },

  // ──────────────────────────────────────────────────────────────
  // عرض بطاقات الإحصائيات (Dashboard)
  // ──────────────────────────────────────────────────────────────
  renderStats(user) {
    window.App.renderSharedLayoutData();
    document.getElementById('stat-today-views').textContent = user.todayViews;
    document.getElementById('stat-total-views').textContent = user.totalViews;
    
    const financial = window.App.getFinancialSummary(user);

    document.getElementById('stat-total-earnings').textContent = window.App.formatAmount(financial.totalEarned);

    // شريط التقدم اليومي للمشاهدات
    const settings = window.StorageDB.getSettings();
    const maxViews = settings.maxDailyViews;
    const viewsPct = Math.min((user.todayViews / maxViews) * 100, 100);

    document.getElementById('daily-progress-fill').style.width = viewsPct + '%';
    document.getElementById('daily-progress-label').textContent = `${user.todayViews} / ${maxViews} مشاهدة`;
  },

  // ──────────────────────────────────────────────────────────────
  // احتساب وعرض تقدم خبرة XP
  // ──────────────────────────────────────────────────────────────
  renderXPProgress(user) {
    const xp = user.xp || 0;
    let nextLevelName = 'فضي';
    let minXp = 0;
    let maxXp = 100;

    if (xp > 600) {
      nextLevelName = 'المستوى الأقصى';
      minXp = 600;
      maxXp = xp; // إبقاء شريط التقدم ممتلئاً
    } else if (xp > 300) {
      nextLevelName = 'ماسي';
      minXp = 301;
      maxXp = 600;
    } else if (xp > 100) {
      nextLevelName = 'ذهبي';
      minXp = 101;
      maxXp = 300;
    } else {
      nextLevelName = 'فضي';
      minXp = 0;
      maxXp = 100;
    }

    const diff = maxXp - minXp;
    const currentDiff = xp - minXp;
    const xpPct = diff > 0 ? Math.min((currentDiff / diff) * 100, 100) : 100;

    document.getElementById('xp-progress-fill').style.width = xpPct + '%';
    document.getElementById('xp-progress-label').textContent = `${xp} / ${maxXp} XP`;
    document.getElementById('user-xp-display').textContent = xp;
    document.getElementById('next-level-title').textContent = `المستوى القادم: ${nextLevelName}`;
  },

  // ──────────────────────────────────────────────────────────────
  // عرض قائمة الأرباح الأخيرة
  // ──────────────────────────────────────────────────────────────
  renderEarnings(user) {
    const tbody = document.getElementById('earnings-tbody');
    if (!tbody) return;

    const earnings = user.earnings || [];
    if (earnings.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="3" class="text-center text-muted" style="padding: 24px;">
            لا توجد عمليات أرباح في حسابك بعد.
          </td>
        </tr>
      `;
      return;
    }

    // عرض آخر 6 عمليات
    const recent = earnings.slice(0, 6);
    tbody.innerHTML = recent.map(e => {
      const amountCls = e.amount >= 0 ? 'text-secondary' : 'text-accent';
      const safeType = window.App.escapeHTML(e.type);
      return `
        <tr>
          <td>${window.App.formatDateTime(e.date)}</td>
          <td>${safeType}</td>
          <td><span class="${amountCls} fw-bold">${window.App.formatMoney(e.amount, { sign: true })}</span></td>
        </tr>
      `;
    }).join('');
  },

  // ──────────────────────────────────────────────────────────────
  // عرض الخط الزمني للنشاطات
  // ──────────────────────────────────────────────────────────────
  renderTimeline(user) {
    const container = document.getElementById('timeline-container');
    if (!container) return;

    const timeline = user.timeline || [];
    if (timeline.length === 0) {
      container.innerHTML = `
        <div class="text-center text-muted" style="padding: 24px 0;">
          لا توجد نشاطات مسجلة في الخط الزمني بعد.
        </div>
      `;
      return;
    }

    // خريطة كلاسات الأيقونات حسب نوع النشاط
    const iconMap = {
      'دخول': '<i class="fa fa-sign-in-alt text-primary"></i>',
      'مشاهدة': '<i class="fa fa-play text-secondary"></i>',
      'سحب': '<i class="fa fa-wallet text-secondary"></i>',
      'رفض': '<i class="fa fa-times text-accent"></i>',
      'هدية': '<i class="fa fa-gift text-warning"></i>',
      'ترقية': '<i class="fa fa-gem text-primary"></i>',
      'عضوية': '<i class="fa fa-user-plus text-primary"></i>',
      'نظام': '<i class="fa fa-cog text-muted"></i>'
    };

    const typeClasses = {
      'مشاهدة': 'watch',
      'سحب': 'withdraw',
      'رفض': 'reject',
      'هدية': 'gift',
      'ترقية': 'gift'
    };

    // عرض آخر 5 نشاطات في الخط الزمني
    const recent = timeline.slice(0, 5);
    container.innerHTML = recent.map(t => {
      const cls = typeClasses[t.type] || '';
      
      // حساب فارق الوقت بشكل مقروء
      const timeStr = this.getRelativeTime(t.date);

      return `
        <div class="timeline-item ${cls}">
          <div class="timeline-dot"></div>
          <div class="timeline-time">${timeStr}</div>
          <div class="timeline-content">
            <div class="timeline-title">${window.App.escapeHTML(t.type)}</div>
            <div class="timeline-desc">${window.App.escapeHTML(t.message)}</div>
          </div>
        </div>
      `;
    }).join('');
  },

  // دالة لحساب الوقت النسبي (مثلاً: قبل 5 دقائق)
  getRelativeTime(isoString) {
    const date = new Date(isoString);
    const seconds = Math.floor((new Date() - date) / 1000);

    let interval = Math.floor(seconds / 31536000);
    if (interval >= 1) return `قبل ${interval} سنة`;
    interval = Math.floor(seconds / 2592000);
    if (interval >= 1) return `قبل ${interval} شهر`;
    interval = Math.floor(seconds / 86400);
    if (interval >= 1) return `قبل ${interval} يوم`;
    interval = Math.floor(seconds / 3600);
    if (interval >= 1) return `قبل ${interval} ساعة`;
    interval = Math.floor(seconds / 60);
    if (interval >= 1) return `قبل ${interval} دقيقة`;
    
    return 'الآن';
  },

  // ──────────────────────────────────────────────────────────────
  // تهيئة زر المشاهدة (التحقق من تخطي الحد اليومي)
  // ──────────────────────────────────────────────────────────────
  setupWatchButton(user) {
    const watchBtn = document.getElementById('dashboard-watch-btn');
    if (!watchBtn) return;

    const settings = window.StorageDB.getSettings();
    if (user.todayViews >= settings.maxDailyViews) {
      watchBtn.classList.remove('btn-primary');
      watchBtn.classList.add('btn-secondary');
      watchBtn.innerHTML = '✋ لقد استنفدت مشاهداتك لهذا اليوم';
      watchBtn.addEventListener('click', (e) => {
        e.preventDefault();
        window.App.showToast('لقد وصلت للحد اليومي للمشاهدات المسموح بها! يرجى العودة غداً.', 'warning');
      });
    }
  },

  // ──────────────────────────────────────────────────────────────
  // 💳 تهيئة صفحة المحفظة والسحب (Wallet Page)
  // ──────────────────────────────────────────────────────────────
  initWallet(user) {
    const settings = window.StorageDB.getSettings();
    
    // تحديث الحد الأدنى المعروض في الواجهة
    const minWithdrawDisplay = document.getElementById('min-withdraw-display');
    const withdrawAmountInput = document.getElementById('withdraw-amount');
    
    window.App.renderSharedLayoutData();
    if (minWithdrawDisplay) minWithdrawDisplay.textContent = window.App.formatMoney(settings.minWithdraw);
    if (withdrawAmountInput) {
      withdrawAmountInput.min = settings.minWithdraw;
      withdrawAmountInput.placeholder = settings.minWithdraw;
    }

    this.renderWithdrawalsHistory(user);
    this.setupWithdrawForm(user, settings);
    this.updatePendingWithdrawState(user);
  },

  getWithdrawMethod(methodKey) {
    return this.withdrawMethods[methodKey] || null;
  },

  normalizeWithdrawAccount(methodKey, account) {
    const value = String(account || '').trim();
    if (methodKey === 'instapay') {
      return value.toLowerCase();
    }
    return value.replace(/[\s-]/g, '');
  },

  validateWithdrawDetails(methodKey, account) {
    const method = this.getWithdrawMethod(methodKey);
    if (!method) {
      return { valid: false, message: 'يرجى اختيار طريقة سحب صحيحة.' };
    }

    const normalized = this.normalizeWithdrawAccount(methodKey, account);
    if (methodKey === 'instapay') {
      if (!/^[a-zA-Z0-9._-]{3,64}@[a-zA-Z0-9._-]{2,64}$/.test(normalized)) {
        return { valid: false, message: 'عنوان InstaPay غير صحيح. استخدم صيغة مثل username@instapay.' };
      }
      return { valid: true, account: normalized };
    }

    const phonePattern = new RegExp(`^${method.prefix}\\d{8}$`);
    if (!phonePattern.test(normalized)) {
      return { valid: false, message: `رقم ${method.label} يجب أن يكون 11 رقمًا ويبدأ بـ ${method.prefix}.` };
    }

    return { valid: true, account: normalized };
  },

  updateWithdrawAccountFields() {
    const methodSelect = document.getElementById('withdraw-method');
    const accountInput = document.getElementById('withdraw-account');
    const accountLabel = document.getElementById('withdraw-account-label');
    const accountHelp = document.getElementById('withdraw-account-help');
    if (!methodSelect || !accountInput) return;

    const method = this.getWithdrawMethod(methodSelect.value);
    if (!method) {
      accountInput.placeholder = 'اختر طريقة السحب أولًا';
      if (accountLabel) accountLabel.textContent = 'رقم المحفظة أو عنوان InstaPay';
      if (accountHelp) accountHelp.textContent = 'سيتم عرض صيغة البيانات المطلوبة بعد اختيار طريقة السحب.';
      return;
    }

    accountInput.placeholder = method.placeholder;
    accountInput.inputMode = methodSelect.value === 'instapay' ? 'email' : 'numeric';
    if (accountLabel) {
      accountLabel.textContent = methodSelect.value === 'instapay'
        ? 'عنوان InstaPay'
        : `رقم محفظة ${method.label}`;
    }
    if (accountHelp) accountHelp.textContent = method.help;
  },

  updatePendingWithdrawState(user) {
    const submitBtn = document.getElementById('withdraw-submit-btn');
    if (!submitBtn) return;

    const hasPending = window.StorageDB.hasPendingWithdrawal(user.id);
    submitBtn.disabled = hasPending;
    submitBtn.textContent = hasPending
      ? 'لديك طلب سحب قيد المراجعة'
      : 'إرسال طلب السحب 💸';
  },

  renderWithdrawalsHistory(user) {
    const tbody = document.getElementById('withdrawals-history-tbody');
    if (!tbody) return;

    const withdrawals = window.StorageDB.getWithdrawals().filter(w => w.userId === user.id);

    if (withdrawals.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="5" class="text-center text-muted" style="padding: 24px;">
            لا توجد طلبات سحب سابقة في حسابك.
          </td>
        </tr>
      `;
      return;
    }

    const statusMap = {
      pending: ['warning', 'قيد المراجعة'],
      approved: ['success', 'تم التحويل'],
      rejected: ['danger', 'مرفوض']
    };

    tbody.innerHTML = withdrawals.map(w => {
      const [cls, label] = statusMap[w.status] || ['primary', w.status];
      const methodLabel = w.methodLabel || this.getWithdrawMethod(w.methodKey)?.label || w.method;
      return `
        <tr>
          <td>${window.App.formatDateTime(w.date)}</td>
          <td><span class="fw-bold">${window.App.formatMoney(w.amount)}</span></td>
          <td>${window.App.escapeHTML(methodLabel)}</td>
          <td><code>${window.App.escapeHTML(w.account)}</code></td>
          <td><span class="badge badge-${cls}">${label}</span></td>
        </tr>
      `;
    }).join('');
  },

  setupWithdrawForm(user, settings) {
    const form = document.getElementById('withdraw-form');
    const submitBtn = document.getElementById('withdraw-submit-btn');
    const methodSelect = document.getElementById('withdraw-method');
    if (!form) return;

    if (methodSelect && !methodSelect.dataset.bound) {
      methodSelect.addEventListener('change', () => this.updateWithdrawAccountFields());
      methodSelect.dataset.bound = 'true';
      this.updateWithdrawAccountFields();
    }

    if (form.dataset.bound === 'true') return;
    form.dataset.bound = 'true';

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const currentUser = window.Auth.refreshSession();
      if (!currentUser) return;

      // التحقق من تفعيل عمليات السحب من الإدارة
      if (!settings.withdrawalsEnabled) {
        window.App.showToast('عمليات السحب معطلة حالياً من قبل الإدارة لمراجعة الصيانة', 'warning');
        return;
      }

      const amount = Number(document.getElementById('withdraw-amount').value);
      const methodKey = document.getElementById('withdraw-method').value;
      const account = document.getElementById('withdraw-account').value.trim();
      const selectedMethod = this.getWithdrawMethod(methodKey);

      // التحقق من المدخلات والرصيد
      if (!Number.isFinite(amount) || amount <= 0) {
        window.App.showToast('يرجى إدخال مبلغ سحب صحيح.', 'error');
        return;
      }

      if (amount < settings.minWithdraw) {
        window.App.showToast(`الحد الأدنى للسحب هو ${window.App.formatMoney(settings.minWithdraw)}`, 'error');
        return;
      }

      const availableBalance = window.App.getFinancialSummary(currentUser).available;
      if (amount > availableBalance) {
        window.App.showToast('رصيدك الحالي غير كافٍ لإتمام عملية السحب هذه', 'error');
        return;
      }

      if (!selectedMethod || !account) {
        window.App.showToast('يرجى ملء جميع الخانات بشكل صحيح', 'error');
        return;
      }

      if (window.StorageDB.hasPendingWithdrawal(currentUser.id)) {
        window.App.showToast('لديك طلب سحب قيد المراجعة بالفعل. انتظر مراجعته قبل إرسال طلب جديد.', 'warning');
        this.updatePendingWithdrawState(currentUser);
        return;
      }

      const validation = this.validateWithdrawDetails(methodKey, account);
      if (!validation.valid) {
        window.App.showToast(validation.message, 'error');
        return;
      }

      window.App.setLoading(submitBtn, true);

      try {
        const result = await window.StorageDB.requestWithdrawal(currentUser, {
          userName: currentUser.name,
          amount,
          methodKey,
          methodLabel: selectedMethod.label,
          method: selectedMethod.label,
          account: validation.account
        });

        if (!result.valid) {
          window.App.showToast(result.reason || 'تعذر إرسال طلب السحب.', 'error');
          return;
        }

        if (result.user && window.AuthService && typeof window.AuthService.setCurrentUserProfile === 'function') {
          window.AuthService.setCurrentUserProfile(result.user);
        }

        window.AppAnalytics?.trackWithdrawRequest({
          amount,
          methodKey,
          methodLabel: selectedMethod.label
        });

        window.App.setLoading(submitBtn, false);
        window.App.showToast('تم إرسال طلب السحب بنجاح! سيتم تحويل الرصيد خلال 24 ساعة.', 'success');

        form.reset();

        // إعادة تحميل الرصيد والجدول في الصفحة
        window.App.renderSharedLayoutData();
        this.renderWithdrawalsHistory(result.user || currentUser);
        this.updatePendingWithdrawState(result.user || currentUser);
        this.updateWithdrawAccountFields();
      } catch (error) {
        window.App.showToast(error.message || 'حدث خطأ أثناء إرسال طلب السحب.', 'error');
      } finally {
        window.App.setLoading(submitBtn, false);
      }
    });
  }
};

document.addEventListener('DOMContentLoaded', () => {
  Dashboard.init();
});
