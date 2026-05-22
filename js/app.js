/* ============================================================
   app.js — المنطق العام والتفاعلات المشتركة (المظهر، الجلسة، التنبيهات)
   ============================================================ */

'use strict';

const App = {
  init() {
    this.initTheme();
    this.initPasswordToggles();
    this.initMobileSidebar();
    this.renderSharedLayoutData();
    this.setupActiveNavLinks();
  },

  // ──────────────────────────────────────────────────────────────
  // تهيئة وتنسيق الوضع اللوني (الداكن كافتراضي فاخر)
  // ──────────────────────────────────────────────────────────────
  initTheme() {
    const savedTheme = localStorage.getItem('ap_theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);

    // إضافة مستمع لزر التغيير إن وجد
    const toggleBtn = document.getElementById('theme-toggle');
    if (toggleBtn) {
      this.updateThemeButtonIcon(toggleBtn, savedTheme);
      toggleBtn.addEventListener('click', () => {
        const current = document.documentElement.getAttribute('data-theme');
        const next = current === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', next);
        localStorage.setItem('ap_theme', next);
        this.updateThemeButtonIcon(toggleBtn, next);
        App.showToast(`تم التغيير للوضع ${next === 'dark' ? 'الداكن' : 'المضيء'}`, 'info');
      });
    }
  },

  updateThemeButtonIcon(btn, theme) {
    if (theme === 'dark') {
      btn.innerHTML = '<i class="fa fa-sun"></i>';
      btn.title = 'التبديل للوضع المضيء';
    } else {
      btn.innerHTML = '<i class="fa fa-moon"></i>';
      btn.title = 'التبديل للوضع الداكن';
    }
  },

  initPasswordToggles() {
    document.querySelectorAll('[data-password-toggle]').forEach(btn => {
      if (btn.dataset.bound === 'true') return;
      const inputId = btn.dataset.passwordToggle;
      const input = document.getElementById(inputId);
      if (!input) return;

      btn.dataset.bound = 'true';
      btn.addEventListener('click', () => {
        const isHidden = input.type === 'password';
        input.type = isHidden ? 'text' : 'password';
        const label = isHidden ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور';
        btn.setAttribute('aria-label', label);
        btn.title = label;

        const icon = btn.querySelector('i');
        if (icon) {
          icon.classList.toggle('fa-eye', !isHidden);
          icon.classList.toggle('fa-eye-slash', isHidden);
        }
      });
    });
  },

  // ──────────────────────────────────────────────────────────────
  // التحكم بالقائمة الجانبية في الشاشات الصغيرة
  // ──────────────────────────────────────────────────────────────
  initMobileSidebar() {
    const toggleMenuBtn = document.getElementById('mobile-menu-toggle');
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.getElementById('sidebar-overlay');

    if (toggleMenuBtn && sidebar) {
      // إنشاء طبقة تظليل خلفية إذا لم تكن موجودة
      let backOverlay = overlay;
      if (!backOverlay) {
        backOverlay = document.createElement('div');
        backOverlay.id = 'sidebar-overlay';
        backOverlay.className = 'sidebar-overlay';
        document.body.appendChild(backOverlay);
      }

      toggleMenuBtn.addEventListener('click', () => {
        sidebar.classList.toggle('open');
        backOverlay.classList.toggle('show');
      });

      backOverlay.addEventListener('click', () => {
        sidebar.classList.remove('open');
        backOverlay.classList.remove('show');
      });
    }
  },

  // ──────────────────────────────────────────────────────────────
  // تعبئة البيانات المشتركة في الهيدر والسايدبار
  // ──────────────────────────────────────────────────────────────
  renderSharedLayoutData() {
    const user = window.Auth.refreshSession();
    if (!user) return;

    // تحديث الاسم
    const nameEls = document.querySelectorAll('.js-user-name');
    nameEls.forEach(el => el.textContent = user.name);

    // تحديث المستوى واللقب
    const levelEls = document.querySelectorAll('.js-user-level');
    levelEls.forEach(el => el.textContent = user.level || 'برونزي');

    // تحديث الرصيد
    const financial = this.getFinancialSummary(user);
    const balanceEls = document.querySelectorAll('.js-user-balance');
    balanceEls.forEach(el => {
      if (el.tagName === 'SPAN' || el.tagName === 'DIV') {
        const mode = el.dataset.moneyFormat
          || (el.classList.contains('stat-value') || el.classList.contains('wallet-balance-big') ? 'amount' : 'full');
        el.textContent = mode === 'amount'
          ? this.formatAmount(financial.available)
          : this.formatMoney(financial.available);
      }
    });

    // تحديث الـ Avatar (الحرف الأول من الاسم)
    const avatarEls = document.querySelectorAll('.js-user-avatar');
    avatarEls.forEach(el => {
      el.textContent = user.name ? user.name[0] : '؟';
    });

    // إظهار/إخفاء زر الأدمن في السايدبار إذا كان الأدمن مسجل دخوله
    const adminLink = document.querySelector('.js-admin-link');
    if (adminLink) {
      adminLink.style.display = window.Auth?.isAdmin?.() ? 'flex' : 'none';
    }
  },

  // ──────────────────────────────────────────────────────────────
  // تحديد الصفحة النشطة في الروابط تلقائياً
  // ──────────────────────────────────────────────────────────────
  setupActiveNavLinks() {
    const path = window.location.pathname.toLowerCase();
    const links = document.querySelectorAll('.sidebar-link, .mobile-nav-item');

    links.forEach(link => {
      const href = link.getAttribute('href') || link.getAttribute('data-href');
      if (href) {
        // التحقق من المطابقة بين اسم الصفحة الحالي والرابط
        const baseHref = href.replace('../', '').replace('./', '');
        if (path.endsWith(baseHref) || (path.endsWith('/') && baseHref === 'index.html')) {
          link.classList.add('active');
        } else {
          link.classList.remove('active');
        }
      }
    });
  },

  escapeHTML(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[char]));
  },

  normalizeMoney(value) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : 0;
  },

  formatAmount(value) {
    return this.normalizeMoney(value).toFixed(2);
  },

  formatMoney(value, options = {}) {
    const numeric = this.normalizeMoney(value);
    const sign = options.sign && numeric > 0 ? '+' : '';
    return `${sign}${this.formatAmount(numeric)} جنيه`;
  },

  getFinancialSummary(user) {
    const earnings = Array.isArray(user?.earnings) ? user.earnings : [];
    const totalEarned = earnings
      .map(e => this.normalizeMoney(e.amount))
      .filter(amount => amount > 0)
      .reduce((sum, amount) => sum + amount, 0);
    const totalDebits = earnings
      .map(e => this.normalizeMoney(e.amount))
      .filter(amount => amount < 0)
      .reduce((sum, amount) => sum + Math.abs(amount), 0);
    const rawBalance = this.normalizeMoney(user?.balance);
    const computedAvailable = Math.max(0, totalEarned - totalDebits);
    const available = Math.max(rawBalance, computedAvailable);

    return {
      rawBalance: +rawBalance.toFixed(2),
      totalEarned: +totalEarned.toFixed(2),
      totalDebits: +totalDebits.toFixed(2),
      available: +available.toFixed(2)
    };
  },

  // ──────────────────────────────────────────────────────────────
  // إظهار الإشعارات المنبثقة (Toast Notification)
  // ──────────────────────────────────────────────────────────────
  showToast(message, type = 'success') {
    const icons = {
      success: 'fa-check-circle',
      error: 'fa-times-circle',
      info: 'fa-info-circle',
      warning: 'fa-exclamation-circle'
    };

    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      container.className = 'toast-container';
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    const iconWrap = document.createElement('span');
    iconWrap.className = 'toast-icon';
    iconWrap.innerHTML = `<i class="fa ${icons[type] || icons.info}"></i>`;
    const messageWrap = document.createElement('span');
    messageWrap.className = 'toast-message';
    messageWrap.textContent = message;
    toast.append(iconWrap, messageWrap);
    container.appendChild(toast);

    // تفاعل الظهور والاختفاء مع الأنيميشن
    setTimeout(() => toast.classList.add('show'), 50);
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 400);
    }, 4000);
  },

  // تنسيق التاريخ والوقت
  formatDateTime(isoString) {
    if (!isoString) return '—';
    const date = new Date(isoString);
    return date.toLocaleDateString('ar-EG', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  },

  // محاكي لتحميل الأزرار (Spinner)
  setLoading(btn, isLoading) {
    if (isLoading) {
      btn.dataset.originalText = btn.innerHTML;
      btn.innerHTML = '<span class="spinner"></span>';
      btn.disabled = true;
    } else {
      btn.innerHTML = btn.dataset.originalText || btn.innerHTML;
      btn.disabled = false;
    }
  }
};

// تشغيل التهيئة العامة عند اكتمال الـ DOM
document.addEventListener('DOMContentLoaded', () => {
  App.init();

  // إعداد زر تسجيل الخروج المشترك
  const logoutBtns = document.querySelectorAll('.js-logout-btn');
  logoutBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      if (confirm('هل أنت متأكد من رغبتك في تسجيل الخروج؟')) {
        window.Auth.logout();
      }
    });
  });
});

window.App = App;
