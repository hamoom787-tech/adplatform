/* ============================================================
   admin.js — نظام لوحة التحكم الإدارية، الحقن التلقائي للتصميم والمنطق
   ============================================================ */

'use strict';

const Admin = {
  user: null,
  settings: null,
  liveRefreshTimer: null,
  liveRefreshBound: false,
  
  async init() {
    if (window.Auth && typeof window.Auth.ready === 'function') {
      await window.Auth.ready();
    }
    if (window.AdminService && !(await window.AdminService.requireAdminPage())) {
      return;
    }
    // 1. التحقق من صلاحيات الأدمن والوصول
    this.user = window.Auth.refreshSession();
    if (!this.user || !(window.Auth.isAdmin && window.Auth.isAdmin())) {
      window.Router.redirect('../login.html');
      return;
    }

    const path = window.location.pathname.toLowerCase();
    if (path.includes('ads.html')) {
      this.setupAddAdForm();
    }
    await this.ensurePageData(path);
    this.settings = window.StorageDB.getSettings();

    // 2. بناء الهيكل الموحد للصفحة (Sidebar & Topbar & Mobile Layout)
    this.injectSharedLayout();

    // 3. تهيئة الأحداث المشتركة (المظهر، تسجيل الخروج، القائمة الجانبية للموبايل)
    this.initSharedEvents();

    // 4. التعرف على الصفحة الحالية وتشغيل منطقها الخاص
    if (path.includes('users.html')) {
      this.initUsersPage();
    } else if (path.includes('ads.html')) {
      this.initAdsPage();
    } else if (path.includes('withdrawals.html')) {
      this.initWithdrawalsPage();
    } else if (path.includes('settings.html')) {
      this.initSettingsPage();
    } else if (path.includes('errors.html')) {
      this.initErrorsPage();
    } else if (path.includes('exports.html')) {
      this.initExportsPage();
    } else {
      this.initStatsDashboard();
    }

    this.setupLiveRefresh();
  },

  async ensurePageData(path) {
    if (!window.FirestoreService || !window.FirestoreService.isAvailable()) return;
    const tasks = [window.FirestoreService.ensureSettings()];

    if (path.includes('ads.html')) {
      tasks.push(window.FirestoreService.ensureAds());
      tasks.push(window.FirestoreService.ensureAnalytics());
    } else if (path.includes('users.html')) {
      tasks.push(window.FirestoreService.ensureUsers());
    } else if (path.includes('withdrawals.html')) {
      tasks.push(window.FirestoreService.ensureUsers());
      tasks.push(window.FirestoreService.ensureWithdrawals());
    } else if (path.includes('errors.html') || path.includes('exports.html')) {
      // Loaded on demand to reduce Firestore reads.
    } else if (!path.includes('settings.html')) {
      tasks.push(window.FirestoreService.ensureUsers());
      tasks.push(window.FirestoreService.ensureAds());
      tasks.push(window.FirestoreService.ensureWithdrawals());
      tasks.push(window.FirestoreService.ensureAnalytics());
    }

    await Promise.allSettled(tasks);
  },

  setupLiveRefresh() {
    if (this.liveRefreshBound) return;

    const refreshCurrentView = () => {
      const path = window.location.pathname.toLowerCase();
      if (path.includes('ads.html')) {
        this.renderAdsTable();
      } else if (path.includes('withdrawals.html')) {
        const searchInput = document.getElementById('withdraw-search');
        const statusFilter = document.getElementById('withdraw-status-filter');
        this.renderWithdrawalsTable(
          searchInput ? searchInput.value : '',
          statusFilter ? statusFilter.value : 'all'
        );
      } else if (!path.includes('users.html') && !path.includes('settings.html')) {
        this.initStatsDashboard();
      }
    };

    window.addEventListener('storage', (event) => {
      if (['ap_ads', 'ap_ad_analytics', 'ap_withdrawals', 'ap_users'].includes(event.key)) {
        refreshCurrentView();
      }
    });

    window.addEventListener('ap:data-changed', (event) => {
      const type = event.detail?.type;
      const path = window.location.pathname.toLowerCase();
      if (path.includes('ads.html') && ['ads', 'analytics', 'settings'].includes(type)) {
        refreshCurrentView();
      } else if (path.includes('withdrawals.html') && ['withdrawals', 'users'].includes(type)) {
        refreshCurrentView();
      } else if (!path.includes('users.html') && !path.includes('settings.html') && ['users', 'ads', 'withdrawals', 'analytics'].includes(type)) {
        refreshCurrentView();
      }
    });

    this.liveRefreshBound = true;
  },

  // ──────────────────────────────────────────────────────────────
  // حقن التخطيط المشترك (Layout Injection)
  // ──────────────────────────────────────────────────────────────
  injectSharedLayout() {
    const appLayout = document.getElementById('admin-layout');
    if (!appLayout) return;

    // الحصول على اسم الصفحة الحالية لتفعيل الرابط النشط
    const path = window.location.pathname.toLowerCase();
    const isPage = (name) => path.includes(name);

    const getActiveCls = (name) => {
      if (name === 'index' && !isPage('users.html') && !isPage('ads.html') && !isPage('withdrawals.html') && !isPage('settings.html') && !isPage('errors.html') && !isPage('exports.html')) {
        return 'active';
      }
      return isPage(name + '.html') ? 'active' : '';
    };

    // 1. إنشاء هيدر الموبايل
    const mobileHeader = document.createElement('header');
    mobileHeader.className = 'mobile-header';
    mobileHeader.innerHTML = `
      <button id="mobile-menu-toggle" style="font-size: 20px; color: var(--text-primary);">
        <i class="fa fa-bars"></i>
      </button>
      <span style="font-size: 1.2rem; font-weight: 900; background: var(--gradient); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">💰 ربحي (الإدارة)</span>
      <div class="user-avatar js-user-avatar" style="width: 32px; height: 32px; font-size: 13px;">أ</div>
    `;

    // 2. إنشاء السايدبار المشترك
    const sidebar = document.createElement('aside');
    sidebar.className = 'sidebar';
    sidebar.innerHTML = `
      <div class="logo">
        <span>💰 ربحي <small style="font-size: 11px; color: var(--warning); display: block; font-weight: normal; margin-top: 2px;">لوحة الإدارة</small></span>
      </div>
      <nav class="sidebar-nav">
        <a href="index.html" class="sidebar-link ${getActiveCls('index')}">
          <i class="fa fa-chart-pie"></i> لوحة الإحصائيات
        </a>
        <a href="users.html" class="sidebar-link ${getActiveCls('users')}">
          <i class="fa fa-users"></i> إدارة الأعضاء
        </a>
        <a href="ads.html" class="sidebar-link ${getActiveCls('ads')}">
          <i class="fa fa-ad"></i> إدارة الإعلانات
        </a>
        <a href="withdrawals.html" class="sidebar-link ${getActiveCls('withdrawals')}">
          <i class="fa fa-money-check-alt"></i> طلبات السحب
        </a>
        <a href="settings.html" class="sidebar-link ${getActiveCls('settings')}">
          <i class="fa fa-sliders-h"></i> الإعدادات العامة
        </a>
        <a href="errors.html" class="sidebar-link ${getActiveCls('errors')}">
          <i class="fa fa-bug"></i> Ù„ÙˆØ­Ø© Ø§Ù„Ø£Ø®Ø·Ø§Ø¡
        </a>
        <a href="exports.html" class="sidebar-link ${getActiveCls('exports')}">
          <i class="fa fa-download"></i> Export / Backup
        </a>
        <div style="border-top: 1px solid var(--border); margin: 15px 0;"></div>
        <a href="../dashboard.html" class="sidebar-link" style="color: var(--secondary);">
          <i class="fa fa-arrow-right"></i> لوحة المستخدم
        </a>
      </nav>
      <div class="sidebar-footer">
        <div class="user-mini">
          <div class="user-avatar js-user-avatar">أ</div>
          <div class="user-info">
            <div class="user-name js-user-name">المدير العام</div>
            <div class="user-role">
              <span>مدير النظام</span>
              <i class="fa fa-shield-alt" style="color: var(--warning); font-size: 10px;"></i>
            </div>
          </div>
        </div>
        <a href="#" class="sidebar-link js-logout-btn" style="margin-top: 16px; color: var(--accent); padding: 8px 12px; font-size: 14px;">
          <i class="fa fa-sign-out-alt"></i> تسجيل الخروج
        </a>
      </div>
    `;

    // 3. إنشاء شريط التنقل السفلي للهواتف
    const mobileNav = document.createElement('nav');
    mobileNav.className = 'mobile-nav';
    mobileNav.innerHTML = `
      <a href="index.html" class="mobile-nav-item ${getActiveCls('index')}">
        <i class="fa fa-chart-pie"></i><span>الإحصائيات</span>
      </a>
      <a href="users.html" class="mobile-nav-item ${getActiveCls('users')}">
        <i class="fa fa-users"></i><span>الأعضاء</span>
      </a>
      <a href="ads.html" class="mobile-nav-item ${getActiveCls('ads')}">
        <i class="fa fa-ad"></i><span>الإعلانات</span>
      </a>
      <a href="withdrawals.html" class="mobile-nav-item ${getActiveCls('withdrawals')}">
        <i class="fa fa-money-check-alt"></i><span>السحوبات</span>
      </a>
      <a href="settings.html" class="mobile-nav-item ${getActiveCls('settings')}">
        <i class="fa fa-sliders-h"></i><span>الإعدادات</span>
      </a>
    `;

    // 4. إنشاء التوببار للتضمين في المحتوى الرئيسي
    const mainContent = appLayout.querySelector('.main-content');
    if (mainContent) {
      const topbar = document.createElement('div');
      topbar.className = 'topbar';
      topbar.innerHTML = `
        <h4>لوحة التحكم الإدارية ⚙️</h4>
        <div class="topbar-actions">
          <button id="theme-toggle" class="circle-btn" title="تغيير الوضع اللوني">
            <i class="fa fa-moon"></i>
          </button>
          <div class="nav-balance" style="background: rgba(255, 179, 71, 0.1); border-color: rgba(255, 179, 71, 0.2); color: var(--warning); padding: 6px 14px;">
            <i class="fa fa-shield-alt"></i>
            <span>لوحة الأدمن</span>
          </div>
          <button class="circle-btn js-logout-btn" title="تسجيل الخروج" style="color: var(--accent);">
            <i class="fa fa-sign-out-alt"></i>
          </button>
        </div>
      `;
      // إدراج التوب بار كأول عنصر في المحتوى الرئيسي
      mainContent.insertBefore(topbar, mainContent.firstChild);
    }

    // إدراج هيدر الموبايل والسايدبار والتنقل السفلي
    appLayout.insertBefore(mobileHeader, appLayout.firstChild);
    appLayout.insertBefore(sidebar, appLayout.children[1] || null);
    appLayout.appendChild(mobileNav);

    // تحديث تفاصيل حساب الأدمن في اللياوت
    const adminName = this.user.name || 'المدير العام';
    const nameEls = document.querySelectorAll('.js-user-name');
    nameEls.forEach(el => el.textContent = adminName);

    const avatarEls = document.querySelectorAll('.js-user-avatar');
    avatarEls.forEach(el => el.textContent = adminName[0]);
  },

  // ──────────────────────────────────────────────────────────────
  // تهيئة تفاعلات اللياوت المشتركة
  // ──────────────────────────────────────────────────────────────
  initSharedEvents() {
    // 1. الوضع اللوني الداكن/المضيء
    const savedTheme = localStorage.getItem('ap_theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);
    const toggleBtn = document.getElementById('theme-toggle');
    if (toggleBtn) {
      this.updateThemeButtonIcon(toggleBtn, savedTheme);
      toggleBtn.onclick = () => {
        const current = document.documentElement.getAttribute('data-theme');
        const next = current === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', next);
        localStorage.setItem('ap_theme', next);
        this.updateThemeButtonIcon(toggleBtn, next);
        window.App.showToast(`تم التغيير للوضع ${next === 'dark' ? 'الداكن' : 'المضيء'}`, 'info');
      };
    }

    // 2. القائمة الجانبية للموبايل
    const toggleMenuBtn = document.getElementById('mobile-menu-toggle');
    const sidebar = document.querySelector('.sidebar');
    if (toggleMenuBtn && sidebar) {
      let overlay = document.getElementById('sidebar-overlay');
      if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'sidebar-overlay';
        overlay.className = 'sidebar-overlay';
        document.body.appendChild(overlay);
      }
      toggleMenuBtn.onclick = () => {
        sidebar.classList.toggle('open');
        overlay.classList.toggle('show');
      };
      overlay.onclick = () => {
        sidebar.classList.remove('open');
        overlay.classList.remove('show');
      };
    }

    // 3. تسجيل الخروج
    const logoutBtns = document.querySelectorAll('.js-logout-btn');
    logoutBtns.forEach(btn => {
      btn.onclick = (e) => {
        e.preventDefault();
        if (confirm('هل أنت متأكد من تسجيل الخروج من لوحة الإدارة؟')) {
          window.Auth.logout();
        }
      };
    });
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

  // ──────────────────────────────────────────────────────────────
  // 1. منطق صفحة الإحصائيات (index.html)
  // ──────────────────────────────────────────────────────────────
  initStatsDashboard() {
    const users = window.StorageDB.getUsers();
    const withdrawals = window.StorageDB.getWithdrawals();
    const ads = window.StorageDB.getAds();

    // حساب الإحصائيات
    const regularUsers = users.filter(u => u.role !== 'admin');
    const pendingWithdrawals = withdrawals.filter(w => w.status === 'pending');
    const activeAds = ads.filter(a => a.active);
    
    // إجمالي المبالغ المدفوعة (تم تحويلها بنجاح)
    const totalPayouts = withdrawals
      .filter(w => w.status === 'approved')
      .reduce((sum, w) => sum + w.amount, 0);

    // عرض الأرقام في البطاقات
    const usersCountEl = document.getElementById('adm-users-count');
    const pendingCountEl = document.getElementById('adm-pending-count');
    const adsCountEl = document.getElementById('adm-ads-count');
    const payoutsEl = document.getElementById('adm-total-payouts');

    if (usersCountEl) usersCountEl.textContent = regularUsers.length;
    if (pendingCountEl) pendingCountEl.textContent = pendingWithdrawals.length;
    if (adsCountEl) adsCountEl.textContent = activeAds.length;
    if (payoutsEl) payoutsEl.textContent = window.App.formatMoney(totalPayouts);

    // عرض جدول طلبات السحب المعلقة الأخيرة (بحد أقصى 5 طلبات)
    const recentTbody = document.getElementById('adm-recent-withdrawals');
    if (recentTbody) {
      const recentPending = pendingWithdrawals.slice(0, 5);
      if (recentPending.length === 0) {
        recentTbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted" style="padding: 16px;">لا توجد طلبات سحب معلقة حالياً.</td></tr>`;
      } else {
        recentTbody.innerHTML = recentPending.map(w => `
          <tr>
            <td><strong>${window.App.escapeHTML(w.userName)}</strong></td>
            <td><span class="text-secondary fw-bold">${window.App.formatMoney(w.amount)}</span></td>
            <td>${window.App.escapeHTML(this.getWithdrawalMethodLabel(w))}</td>
            <td><code>${window.App.escapeHTML(this.getWithdrawalAccount(w))}</code></td>
            <td>${window.App.formatDateTime(w.date)}</td>
            <td>
              <div style="display: flex; gap: 8px;">
                <button class="btn btn-sm btn-success" onclick="Admin.handleWithdrawalAction('${w.id}', 'approved')">قبول</button>
                <button class="btn btn-sm btn-danger" onclick="Admin.handleWithdrawalAction('${w.id}', 'rejected')">رفض</button>
              </div>
            </td>
          </tr>
        `).join('');
      }
    }
  },

  // ──────────────────────────────────────────────────────────────
  // 2. منطق صفحة إدارة الأعضاء (users.html)
  // ──────────────────────────────────────────────────────────────
  initUsersPage() {
    this.renderUsersTable();

    // إعداد البحث والفلترة
    const searchInput = document.getElementById('user-search');
    const statusFilter = document.getElementById('user-status-filter');

    if (searchInput) {
      searchInput.oninput = () => this.renderUsersTable(searchInput.value, statusFilter ? statusFilter.value : 'all');
    }
    if (statusFilter) {
      statusFilter.onchange = () => this.renderUsersTable(searchInput ? searchInput.value : '', statusFilter.value);
    }
  },

  renderUsersTable(searchQuery = '', statusFilter = 'all') {
    const tbody = document.getElementById('adm-users-tbody');
    if (!tbody) return;

    let users = window.StorageDB.getUsers().filter(u => u.role !== 'admin');

    // 1. فلترة البحث
    if (searchQuery.trim() !== '') {
      const q = searchQuery.toLowerCase();
      users = users.filter(u => String(u.name || '').toLowerCase().includes(q) || String(u.email || '').toLowerCase().includes(q));
    }

    // 2. فلترة الحالة
    if (statusFilter !== 'all') {
      users = users.filter(u => u.status === statusFilter);
    }

    if (users.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted" style="padding: 24px;">لا يوجد مستخدمون يطابقون خيارات البحث.</td></tr>`;
      return;
    }

    tbody.innerHTML = users.map(u => {
      const isBanned = u.status === 'banned';
      const safeName = window.App.escapeHTML(u.name || '');
      const safeAvatar = window.App.escapeHTML((u.name || '?')[0]);
      const safeLevel = window.App.escapeHTML(u.level || 'برونزي');
      const safeEmail = window.App.escapeHTML(u.email || '');
      const statusBadge = isBanned 
        ? '<span class="badge badge-danger">موقوف</span>' 
        : '<span class="badge badge-success">نشط</span>';
      
      const actionBtn = isBanned
        ? `<button class="btn btn-sm btn-success" onclick="Admin.toggleUserStatus('${u.id}', 'active')"><i class="fa fa-user-check"></i> تفعيل الحساب</button>`
        : `<button class="btn btn-sm btn-danger" onclick="Admin.toggleUserStatus('${u.id}', 'banned')"><i class="fa fa-user-slash"></i> إيقاف الحساب</button>`;

      return `
        <tr>
          <td>
            <div style="display: flex; align-items: center; gap: 10px;">
              <div class="user-avatar" style="width: 32px; height: 32px; font-size: 13px;">${safeAvatar}</div>
              <div>
                <strong style="display:block;">${safeName}</strong>
                <small style="color:var(--text-muted); font-size:11px;">مستوى: ${safeLevel}</small>
              </div>
            </div>
          </td>
          <td><code>${safeEmail}</code></td>
          <td><span class="text-secondary fw-bold">${window.App.formatMoney(window.App.getFinancialSummary(u).available)}</span></td>
          <td>${u.totalViews} مشاهدة</td>
          <td>${statusBadge}</td>
          <td>
            <div style="display: flex; gap: 8px;">
              ${actionBtn}
              <button class="btn btn-sm btn-secondary" onclick="Admin.showUserDetails('${u.id}')"><i class="fa fa-info-circle"></i> تفاصيل</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  },

  toggleUserStatus(userId, newStatus) {
    const user = window.StorageDB.getUserById(userId);
    if (!user) return;

    const actionText = newStatus === 'banned' ? 'إيقاف' : 'تنشيط';
    if (confirm(`هل أنت متأكد من رغبتك في ${actionText} حساب العضو "${user.name}"؟`)) {
      user.status = newStatus;
      window.StorageDB.updateUser(user);
      
      // إضافة حدث للخط الزمني للعضو
      window.StorageDB.addTimelineEvent(
        userId,
        newStatus === 'banned' ? 'رفض' : 'نظام',
        newStatus === 'banned' ? 'تم تعليق حسابك من قبل الإدارة' : 'تم تفعيل حسابك من قبل الإدارة'
      );

      window.App.showToast(`تم ${actionText} حساب العضو بنجاح.`, 'success');
      
      // تحديث الجدول
      const searchInput = document.getElementById('user-search');
      const statusFilter = document.getElementById('user-status-filter');
      this.renderUsersTable(
        searchInput ? searchInput.value : '', 
        statusFilter ? statusFilter.value : 'all'
      );
    }
  },

  showUserDetails(userId) {
    const user = window.StorageDB.getUserById(userId);
    if (!user) return;

    const dateStr = window.App.formatDateTime(user.joinDate);
    const earningsSum = user.earnings.reduce((sum, e) => e.amount > 0 ? sum + e.amount : sum, 0);

    alert(`📋 تفاصيل حساب العضو:
------------------------------
الاسم: ${user.name}
البريد الإلكتروني: ${user.email}
تاريخ الانضمام: ${dateStr}
حالة الحساب: ${user.status === 'active' ? 'نشط' : 'موقوف'}
الرصيد الحالي: ${window.App.formatMoney(window.App.getFinancialSummary(user).available)}
إجمالي المشاهدات: ${user.totalViews} مشاهدة
إجمالي الأرباح المجمعة: ${window.App.formatMoney(earningsSum)}
XP الخبرة: ${user.xp || 0}
المستوى الحالي: ${user.level || 'برونزي'}`);
  },

  // ──────────────────────────────────────────────────────────────
  // 3. منطق صفحة إدارة الإعلانات (ads.html)
  // ──────────────────────────────────────────────────────────────
  initAdsPage() {
    this.setupFiltersAndBulkActions();
    this.setupAddAdForm();

    try {
      this.renderAdsTable();
    } catch (error) {
      if (window.App) {
        window.App.showToast('تعذر تحميل جدول الإعلانات، لكن نافذة إضافة إعلان جديد ما زالت متاحة.', 'warning');
      }
    }
  },

  renderAdsTable() {
    const tbody = document.getElementById('adm-ads-tbody');
    if (!tbody) return;

    const ads = window.StorageDB.getAds();
    const analytics = window.StorageDB.getAdAnalytics();

    const searchQuery = (document.getElementById('ad-search')?.value || '').trim().toLowerCase();
    const typeFilter = document.getElementById('ad-type-filter')?.value || 'all';
    const statusFilter = document.getElementById('ad-status-filter')?.value || 'all';

    // فلترة الإعلانات حسب خيارات البحث والفرز
    let filteredAds = ads.filter(a => {
      const title = String(a.title || '').toLowerCase();
      const category = String(a.category || '').toLowerCase();
      const type = String(a.type || 'html').toLowerCase();

      // فلترة بكلمات البحث
      const matchSearch = title.includes(searchQuery) || category.includes(searchQuery);
      
      // فلترة بنوع الإعلان
      const matchType = typeFilter === 'all' || type === typeFilter;

      // فلترة بالحالة الصحية والأمان
      let matchStatus = true;
      if (statusFilter !== 'all') {
        if (statusFilter === 'good') {
          matchStatus = a.active === true;
        } else if (statusFilter === 'disabled') {
          matchStatus = a.active === false && a.status !== 'error';
        } else if (statusFilter === 'error') {
          matchStatus = a.active === false && a.status === 'error';
        }
      }

      return matchSearch && matchType && matchStatus;
    });

    if (filteredAds.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted" style="padding: 24px;">لا توجد إعلانات تطابق خيارات الفلترة المحددة.</td></tr>`;
      
      // إخفاء خيارات التحكم الجماعي عند فراغ الجدول
      const bulkWrap = document.getElementById('bulk-actions-wrap');
      if (bulkWrap) bulkWrap.style.display = 'none';
      const masterCheckbox = document.getElementById('select-all-ads');
      if (masterCheckbox) masterCheckbox.checked = false;
      return;
    }

    tbody.innerHTML = filteredAds.map(a => {
      const title = String(a.title || 'إعلان بدون عنوان');
      const category = String(a.category || 'عام');
      const type = String(a.type || 'html').toLowerCase();
      const description = String(a.description || 'لا يوجد وصف تفصيلي لهذا الإعلان.');
      const safeTitle = window.App.escapeHTML(title);
      const safeCategory = window.App.escapeHTML(category);
      const safeDescription = window.App.escapeHTML(description);
      const safeErrorMessage = window.App.escapeHTML(a.errorMessage || 'كراش غير معروف');
      const duration = Number.isFinite(Number(a.duration)) ? Number(a.duration) : (Number(this.settings?.adDuration) || 15);
      const reward = Number.isFinite(Number(a.reward)) ? Number(a.reward) : (Number(this.settings?.earnPerView) || 0);

      // جلب بيانات الإحصائيات
      const adStats = analytics[a.id] || { impressions: 0, completedViews: 0, totalWatchTime: 0, totalRewards: 0, averageWatchTime: 0 };
      const imp = adStats.impressions || 0;
      const comp = adStats.completedViews || 0;
      const rate = imp > 0 ? ((comp / imp) * 100).toFixed(0) : 0;
      const payout = adStats.totalRewards || 0;
      const avgTime = adStats.averageWatchTime || 0;

      // حساب الحالة الصحية والصحة
      let healthBadge = '';
      if (a.active) {
        healthBadge = '<span class="badge badge-success"><i class="fa fa-heart"></i> سليم (نشط)</span>';
      } else if (a.status === 'error') {
        healthBadge = `<span class="badge badge-danger" style="cursor:help;" title="خطأ التشغيل: ${safeErrorMessage}"><i class="fa fa-bug"></i> معطوب (كراش)</span>`;
      } else {
        healthBadge = '<span class="badge badge-secondary"><i class="fa fa-eye-slash"></i> معطل</span>';
      }

      const toggleIcon = a.active ? 'fa-eye-slash' : 'fa-eye';
      const toggleText = a.active ? 'تعطيل' : 'تفعيل';
      const btnCls = a.active ? 'btn-secondary' : 'btn-success';

      return `
        <tr>
          <td style="text-align: center; vertical-align: middle;">
            <input type="checkbox" class="ad-row-checkbox" data-id="${a.id}">
          </td>
          <td>
            <div style="font-weight: 700; color: var(--text-primary); max-width: 250px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${safeTitle}">
              ${safeTitle}
            </div>
            <small style="display:block; color:var(--text-muted); font-size:11px; max-width: 250px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${safeDescription}</small>
          </td>
          <td>
            <span class="badge badge-primary">${safeCategory}</span>
            <small style="display:block; font-weight:600; color:var(--text-secondary); margin-top:2px;">${type.toUpperCase()}</small>
          </td>
          <td>
            <div class="text-warning fw-bold">${duration} ثانية</div>
            <small class="text-secondary fw-bold" style="display:block; margin-top:2px;">${window.App.formatMoney(reward)}</small>
          </td>
          <td>
            <div style="font-size:12px;">ظهور: <strong class="text-primary">${imp}</strong> | إكمال: <strong class="text-secondary">${comp}</strong> <small class="text-muted">(${rate}%)</small></div>
            <div style="font-size:11px; color:var(--text-muted); margin-top:2px;">مدفوعات: <strong style="color:var(--text-primary);">${window.App.formatMoney(payout)}</strong> | متوسط الوقت: <strong style="color:var(--text-primary);">${avgTime}ث</strong></div>
          </td>
          <td>${healthBadge}</td>
          <td>
            <div style="display: flex; gap: 6px; flex-wrap: wrap;">
              <button class="btn btn-sm ${btnCls}" onclick="Admin.toggleAdStatus('${a.id}')" title="${toggleText}"><i class="fa ${toggleIcon}"></i></button>
              <button class="btn btn-sm btn-primary" onclick="Admin.editAd('${a.id}')" title="تعديل"><i class="fa fa-edit"></i></button>
              <button class="btn btn-sm btn-secondary" onclick="Admin.duplicateAd('${a.id}')" title="تكرار وإعادة نسخ الإعلان"><i class="fa fa-clone"></i></button>
              <button class="btn btn-sm btn-danger" onclick="Admin.deleteAd('${a.id}')" title="حذف نهائي"><i class="fa fa-trash"></i></button>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    // تحديث مستمعات تحديد العناصر
    this.updateBulkCheckboxState();
  },

  setupFiltersAndBulkActions() {
    const searchInput = document.getElementById('ad-search');
    const typeFilter = document.getElementById('ad-type-filter');
    const statusFilter = document.getElementById('ad-status-filter');
    const selectAll = document.getElementById('select-all-ads');

    if (searchInput) searchInput.oninput = () => this.renderAdsTable();
    if (typeFilter) typeFilter.onchange = () => this.renderAdsTable();
    if (statusFilter) statusFilter.onchange = () => this.renderAdsTable();

    if (selectAll) {
      selectAll.onchange = (e) => {
        const checkboxes = document.querySelectorAll('.ad-row-checkbox');
        checkboxes.forEach(cb => cb.checked = e.target.checked);
        this.updateBulkCheckboxState();
      };
    }

    // ربط أزرار التحكم الجماعي
    const bulkToggle = document.getElementById('bulk-toggle-btn');
    const bulkDelete = document.getElementById('bulk-delete-btn');

    if (bulkToggle) {
      bulkToggle.onclick = () => {
        const selectedIds = this.getSelectedAdIds();
        if (selectedIds.length === 0) return;

        const ads = window.StorageDB.getAds();
        const updatedAds = ads.map(ad => {
          if (selectedIds.includes(ad.id)) {
            const newActive = !ad.active;
            const isRecovered = newActive && (ad.status === 'error' || ad.isBroken);
            return {
              ...ad,
              active: newActive,
              status: isRecovered ? 'active' : ad.status,
              isBroken: isRecovered ? false : ad.isBroken,
              errorMessage: isRecovered ? '' : ad.errorMessage
            };
          }
          return { ...ad };
        });

        window.StorageDB.saveAds(updatedAds);
        window.App.showToast(`تم تعديل حالة الإعلانات المحددة بنجاح.`, 'success');
        
        if (window.AdEngine) {
          window.AdEngine.buildQueue();
          window.AdEngine.refreshCurrentAd();
        }
        this.renderAdsTable();
      };
    }

    if (bulkDelete) {
      bulkDelete.onclick = () => {
        const selectedIds = this.getSelectedAdIds();
        if (selectedIds.length === 0) return;

        if (confirm(`هل أنت متأكد من رغبتك في حذف الإعلانات المحددة (${selectedIds.length} إعلانات) نهائياً من المنصة؟`)) {
          const ads = window.StorageDB.getAds();
          const updatedAds = ads.filter(ad => !selectedIds.includes(ad.id)).map(ad => ({ ...ad }));
          window.StorageDB.saveAds(updatedAds);
          
          window.App.showToast('تم حذف الإعلانات المحددة بنجاح.', 'info');
          
          if (window.AdEngine) {
            window.AdEngine.buildQueue();
            window.AdEngine.refreshCurrentAd();
          }
          this.renderAdsTable();
        }
      };
    }
  },

  getSelectedAdIds() {
    const checkboxes = document.querySelectorAll('.ad-row-checkbox:checked');
    const ids = [];
    checkboxes.forEach(cb => {
      ids.push(cb.getAttribute('data-id'));
    });
    return ids;
  },

  updateBulkCheckboxState() {
    const checkboxes = document.querySelectorAll('.ad-row-checkbox');
    const checkedBoxes = document.querySelectorAll('.ad-row-checkbox:checked');
    const bulkWrap = document.getElementById('bulk-actions-wrap');
    const selectedCount = document.getElementById('selected-count');
    const selectAll = document.getElementById('select-all-ads');

    if (checkboxes.length > 0 && checkedBoxes.length === checkboxes.length) {
      if (selectAll) selectAll.checked = true;
    } else {
      if (selectAll) selectAll.checked = false;
    }

    if (checkedBoxes.length > 0) {
      if (bulkWrap) bulkWrap.style.display = 'flex';
      if (selectedCount) selectedCount.textContent = checkedBoxes.length;
    } else {
      if (bulkWrap) bulkWrap.style.display = 'none';
    }

    // ربط كليك على كل تشيكبوكس لتحديث الشريط
    checkboxes.forEach(cb => {
      cb.onchange = () => this.updateBulkCheckboxState();
    });
  },

  toggleAdStatus(adId) {
    const ad = window.StorageDB.getAdById(adId);
    if (!ad) return;

    const newActive = !ad.active;
    window.StorageDB.updateAd({
      id: adId,
      active: newActive
    });
    
    window.App.showToast(`تم ${newActive ? 'تفعيل' : 'تعطيل'} الإعلان بنجاح.`, 'success');
    
    if (window.AdEngine) {
      window.AdEngine.buildQueue();
      window.AdEngine.refreshCurrentAd();
    }
    this.renderAdsTable();
  },

  deleteAd(adId) {
    if (confirm('هل أنت متأكد من رغبتك في حذف هذا الإعلان نهائياً من المنصة؟')) {
      window.StorageDB.deleteAd(adId);
      window.App.showToast('تم حذف الإعلان بنجاح.', 'info');
      
      if (window.AdEngine) {
        window.AdEngine.buildQueue();
        window.AdEngine.refreshCurrentAd();
      }
      this.renderAdsTable();
    }
  },

  duplicateAd(adId) {
    const duplicated = window.StorageDB.duplicateAd(adId);
    if (duplicated) {
      window.App.showToast(`تم نسخ الإعلان بنجاح تحت اسم "${duplicated.title}".`, 'success');
      
      if (window.AdEngine) {
        window.AdEngine.buildQueue();
        window.AdEngine.refreshCurrentAd();
      }
      this.renderAdsTable();
    } else {
      window.App.showToast('فشل تكرار الإعلان.', 'error');
    }
  },

  editAd(adId) {
    const ad = window.StorageDB.getAdById(adId);
    if (!ad) return;

    // تهيئة وتعبئة المدخلات داخل الفورم ببيانات الإعلان
    document.getElementById('ad-edit-id').value = ad.id;
    document.getElementById('ad-form-title').value = ad.title;
    document.getElementById('ad-form-category').value = ad.category || '';
    document.getElementById('ad-form-type').value = ad.type || 'html';
    document.getElementById('ad-form-duration').value = ad.duration || 15;
    document.getElementById('ad-form-reward').value = ad.reward || 0.50;
    document.getElementById('ad-form-code').value = ad.code || '';
    document.getElementById('ad-form-desc').value = ad.description || '';

    // تعديل العنوان وتسمية الزر
    document.getElementById('modal-title-text').innerHTML = `<i class="fa fa-edit text-primary"></i> تعديل الإعلان الحالي`;
    document.getElementById('form-submit-btn').textContent = 'تحديث الإعلان وحفظ التغييرات 💾';

    // إخفاء المعاينة
    document.getElementById('preview-ad-container-wrap').style.display = 'none';

    // فتح النافذة المنبثقة
    this.openAdModal('edit');
  },

  openAdModal(mode = 'create') {
    const modal = document.getElementById('modal-add-ad');
    if (!modal) {
      window.App?.showToast('تعذر العثور على نافذة إضافة الإعلان داخل الصفحة.', 'error');
      return false;
    }

    modal.style.display = 'flex';
    modal.style.opacity = '1';
    modal.style.pointerEvents = 'auto';
    modal.setAttribute('aria-hidden', 'false');
    modal.classList.add('open', 'active', 'show');

    const firstInput = mode === 'create'
      ? document.getElementById('ad-form-title')
      : document.getElementById('ad-form-code');
    if (firstInput) {
      window.setTimeout(() => firstInput.focus(), 50);
    }

    return true;
  },

  closeAdModal(reason = 'manual') {
    const modal = document.getElementById('modal-add-ad');
    if (!modal) {
      return false;
    }

    modal.classList.remove('open', 'active', 'show');
    modal.setAttribute('aria-hidden', 'true');
    modal.style.removeProperty('display');
    modal.style.removeProperty('opacity');
    modal.style.removeProperty('pointer-events');

    return true;
  },

  validateAdCode(type, code) {
    const lower = code.toLowerCase();
    if (type === 'iframe') {
      try {
        const url = new URL(code);
        if (url.protocol !== 'http:' && url.protocol !== 'https:') {
          return { valid: false, reason: 'يجب أن يبدأ رابط الإطار (iframe) بـ http:// أو https://' };
        }
      } catch (e) {
        return { valid: false, reason: 'رابط الإطار (iframe) غير صالح. يرجى إدخال URL صحيح.' };
      }
    } else if (type === 'html') {
      const dangerousKeywords = [
        'document.body.remove',
        'document.write',
        'parent.document',
        'top.document',
        'document.body.innerhtml',
        'document.documentelement.remove',
        'document.head.remove'
      ];
      for (const keyword of dangerousKeywords) {
        if (lower.includes(keyword)) {
          return { valid: false, reason: `كود الـ HTML يحتوي على عبارة غير آمنة: "${keyword}"` };
        }
      }
    } else if (type === 'script') {
      const dangerousKeywords = [
        'eval',
        'localstorage',
        'sessionstorage',
        'window.location',
        'location.href',
        'parent.location',
        'top.location',
        'parent.'
      ];
      for (const keyword of dangerousKeywords) {
        if (lower.includes(keyword)) {
          return { valid: false, reason: `كود الـ Script يحتوي على عبارة محظورة أو غير آمنة: "${keyword}"` };
        }
      }
    } else if (type === 'vast') {
      const isXml = window.AdNormalizer && window.AdNormalizer.isVastXml
        ? window.AdNormalizer.isVastXml(code)
        : /<\s*VAST\b/i.test(code);
      if (!isXml) {
        try {
          const url = new URL(code);
          if (url.protocol !== 'http:' && url.protocol !== 'https:') {
            return { valid: false, reason: 'رابط VAST يجب أن يبدأ بـ http:// أو https://' };
          }
        } catch (e) {
          return { valid: false, reason: 'أدخل رابط VAST صحيح أو XML يحتوي على <VAST>.' };
        }
      }
      if (lower.includes('<script') || lower.includes('javascript:')) {
        return { valid: false, reason: 'كود VAST يجب أن يكون XML أو رابط فقط، وليس JavaScript.' };
      }
    } else if (type === 'adsense') {
      if (!code.includes('class="adsbygoogle"') && !code.includes("class='adsbygoogle'")) {
        return { valid: false, reason: 'كود AdSense غير صحيح. يجب أن يحتوي على هيكل الإعلان <ins class="adsbygoogle">' };
      }
    }
    return { valid: true };
  },

  setupAddAdForm() {
    const form = document.getElementById('add-ad-form');
    const openBtn = document.getElementById('open-add-ad-btn');
    const closeBtn = document.getElementById('close-add-ad-modal');
    const modal = document.getElementById('modal-add-ad');
    const previewBtn = document.getElementById('preview-ad-btn');
    const previewContainer = document.getElementById('admin-ad-preview-viewport');
    const previewWrap = document.getElementById('preview-ad-container-wrap');

    if (openBtn && modal) {
      openBtn.onclick = (event) => {
        event.preventDefault();

        if (form) form.reset();
        const editId = document.getElementById('ad-edit-id');
        const modalTitle = document.getElementById('modal-title-text');
        const submitBtn = document.getElementById('form-submit-btn');

        if (editId) editId.value = '';
        if (modalTitle) modalTitle.innerHTML = `<i class="fa fa-plus-circle text-primary"></i> إضافة إعلان جديد للنظام`;
        if (submitBtn) submitBtn.textContent = 'إضافة ونشر الإعلان 🚀';
        if (previewWrap) previewWrap.style.display = 'none';
        this.openAdModal('create');
      };
    } else {
      window.App?.showToast('تعذر ربط زر إضافة إعلان جديد. تأكد من تحميل الصفحة كاملة.', 'error');
    }

    if (closeBtn && modal) {
      closeBtn.onclick = (event) => {
        event.preventDefault();
        this.closeAdModal('close-button');
      };
    }

    if (modal) {
      modal.onclick = (e) => {
        if (e.target === modal) this.closeAdModal('overlay-click');
      };
    }

    // منطق التشغيل والمعاينة الحية المباشرة
    if (previewBtn && previewContainer) {
      previewBtn.onclick = () => {
        const rawType = document.getElementById('ad-form-type').value;
        const rawCode = document.getElementById('ad-form-code').value.trim();
        const normalizedAd = window.AdNormalizer
          ? window.AdNormalizer.normalizeForStorage(rawType, rawCode)
          : { type: rawType, code: rawCode, changed: false };
        const type = normalizedAd.type;
        const code = normalizedAd.code;

        if (!rawCode) {
          window.App.showToast('الرجاء كتابة كود أو رابط الإعلان أولاً للمعاينة!', 'warning');
          return;
        }

        // تشغيل طبقة التحقق الأمني قبل العرض
        const validation = this.validateAdCode(type, code);
        if (!validation.valid) {
          window.App.showToast(`كود الإعلان يحتوي على برمجيات غير آمنة أو غير متوافقة! 🚫\n${validation.reason}`, 'error');
          return;
        }

        // إظهار المعاينة
        previewWrap.style.display = 'block';
        previewContainer.innerHTML = '<span class="text-muted"><i class="fa fa-spinner fa-spin"></i> جاري تحميل المعاينة...</span>';

        // محاكاة إعلان مؤقت وعرضه داخل محرك الأمان
        const dummyAd = {
          id: 'preview-ad-id',
          type: type,
          code: code,
          duration: parseInt(document.getElementById('ad-form-duration').value) || 15
        };

        setTimeout(() => {
          window.AdEngine.renderAd(dummyAd, previewContainer);
        }, 300);
      };
    }

    if (form) {
      form.onsubmit = async (e) => {
        e.preventDefault();

        const editId = document.getElementById('ad-edit-id').value;
        const title = document.getElementById('ad-form-title').value.trim();
        const category = document.getElementById('ad-form-category').value.trim();
        const rawType = document.getElementById('ad-form-type').value;
        const duration = parseInt(document.getElementById('ad-form-duration').value);
        const reward = parseFloat(document.getElementById('ad-form-reward').value);
        const rawCode = document.getElementById('ad-form-code').value.trim();
        const normalizedAd = window.AdNormalizer
          ? window.AdNormalizer.normalizeForStorage(rawType, rawCode)
          : { type: rawType, code: rawCode, changed: false };
        const type = normalizedAd.type;
        const code = normalizedAd.code;
        const desc = document.getElementById('ad-form-desc').value.trim();

        if (!title || !category || !rawCode || isNaN(duration) || isNaN(reward)) {
          window.App.showToast('الرجاء تعبئة الحقول الأساسية بشكل صحيح.', 'error');
          return;
        }

        // تشغيل طبقة التحقق الأمني قبل حفظ الإعلان في Firestore
        const validation = this.validateAdCode(type, code);
        if (!validation.valid) {
          window.App.showToast(`كود الإعلان يحتوي على برمجيات غير آمنة أو غير متوافقة! 🚫\n${validation.reason}`, 'error');
          return;
        }

        try {
          if (editId) {
          // تعديل إعلان قائم
          const ad = window.StorageDB.getAdById(editId);
          if (ad) {
            ad.title = title;
            ad.category = category;
            ad.type = type;
            ad.duration = duration;
            ad.reward = reward;
            ad.code = code;
            ad.description = desc;
            
            // استرجاع الإعلان لحالة جيدة عند تعديله
            ad.status = 'active';
            ad.isBroken = false;
            ad.errorMessage = '';

            if (window.FirestoreService?.isAvailable()) {
              await window.FirestoreService.updateAd(ad);
            } else {
              window.StorageDB.updateAd(ad);
            }
            window.App.showToast('تم تحديث الإعلان وحفظ التغييرات بنجاح! 💾', 'success');
          }
          } else {
          // إضافة إعلان جديد
          const newAd = {
            title,
            category,
            type,
            duration,
            reward,
            code,
            description: desc,
            active: true,
            status: 'active',
            isBroken: false,
            errorMessage: ''
          };
          if (window.FirestoreService?.isAvailable()) {
            await window.FirestoreService.addAd(newAd);
          } else {
            window.StorageDB.addAd(newAd);
          }
          window.App.showToast('تمت إضافة الإعلان الجديد بنجاح ونشره للمشاهدة! 🚀', 'success');
        }

        if (normalizedAd.changed) {
          window.App.showToast('تم تجهيز الإعلان تلقائياً للعرض الآمن داخل iframe معزول.', 'info');
        }

        // إعادة بناء القائمة ومزامنة الشاشة الجارية فورياً بدون ريفريش
        } catch (error) {
          window.App.showToast(error.message || 'تعذر حفظ الإعلان في Firestore.', 'error');
          return;
        }

        if (window.AdEngine) {
          window.AdEngine.buildQueue();
          window.AdEngine.refreshCurrentAd();
        }

        form.reset();
        this.closeAdModal('submit-success');
        this.renderAdsTable();
      };
    }
  },

  // ──────────────────────────────────────────────────────────────
  // 4. منطق صفحة طلبات السحب (withdrawals.html)
  // ──────────────────────────────────────────────────────────────
  initWithdrawalsPage() {
    this.renderWithdrawalsTable();

    const searchInput = document.getElementById('withdraw-search');
    const statusFilter = document.getElementById('withdraw-status-filter');

    if (searchInput) {
      searchInput.oninput = () => this.renderWithdrawalsTable(searchInput.value, statusFilter ? statusFilter.value : 'all');
    }
    if (statusFilter) {
      statusFilter.onchange = () => this.renderWithdrawalsTable(searchInput ? searchInput.value : '', statusFilter.value);
    }
  },

  getWithdrawalMethodLabel(withdrawal) {
    if (!withdrawal) return 'غير محدد';
    if (withdrawal.methodLabel) return withdrawal.methodLabel;
    if (withdrawal.methodKey === 'vodafone_cash') return 'Vodafone Cash';
    if (withdrawal.methodKey === 'orange_cash') return 'Orange Cash';
    if (withdrawal.methodKey === 'etisalat_cash') return 'Etisalat Cash';
    if (withdrawal.methodKey === 'we_cash') return 'WE Pay / WE Cash';
    if (withdrawal.methodKey === 'instapay') return 'InstaPay';
    return withdrawal.method || 'غير محدد';
  },

  getWithdrawalAccount(withdrawal) {
    const account = String(withdrawal?.account || withdrawal?.walletNumber || withdrawal?.phone || '').trim();
    return account || 'غير متوفر';
  },

  renderWithdrawalsTable(searchQuery = '', statusFilter = 'all') {
    const tbody = document.getElementById('adm-withdrawals-tbody');
    if (!tbody) return;

    let withdrawals = window.StorageDB.getWithdrawals();

    // 1. فلترة البحث
    if (searchQuery.trim() !== '') {
      const q = searchQuery.toLowerCase();
      withdrawals = withdrawals.filter(w => {
        const haystack = [
          w.userName,
          this.getWithdrawalMethodLabel(w),
          w.methodKey,
          w.account,
          w.status
        ].map(value => String(value || '').toLowerCase()).join(' ');
        return haystack.includes(q);
      });
    }

    // 2. فلترة الحالة
    if (statusFilter !== 'all') {
      withdrawals = withdrawals.filter(w => w.status === statusFilter);
    }

    if (withdrawals.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted" style="padding: 24px;">لا توجد طلبات سحب تطابق الفلاتر المحددة.</td></tr>`;
      return;
    }

    const statusMap = {
      pending: ['warning', 'قيد المراجعة'],
      approved: ['success', 'تم التحويل'],
      rejected: ['danger', 'مرفوض']
    };

    tbody.innerHTML = withdrawals.map(w => {
      const [cls, label] = statusMap[w.status] || ['primary', w.status];
      
      let actionButtons = '—';
      if (w.status === 'pending') {
        actionButtons = `
          <button class="btn btn-sm btn-success" onclick="Admin.handleWithdrawalAction('${w.id}', 'approved')"><i class="fa fa-check"></i> موافقة</button>
          <button class="btn btn-sm btn-danger" onclick="Admin.handleWithdrawalAction('${w.id}', 'rejected')"><i class="fa fa-times"></i> رفض</button>
        `;
      }

      return `
        <tr>
          <td><strong>${window.App.escapeHTML(w.userName)}</strong></td>
          <td><span class="text-secondary fw-bold">${window.App.formatMoney(w.amount)}</span></td>
          <td>${window.App.escapeHTML(this.getWithdrawalMethodLabel(w))}</td>
          <td><code>${window.App.escapeHTML(this.getWithdrawalAccount(w))}</code></td>
          <td>${window.App.formatDateTime(w.date)}</td>
          <td><span class="badge badge-${cls}">${label}</span></td>
          <td>
            <div style="display: flex; gap: 8px;">
              ${actionButtons}
            </div>
          </td>
        </tr>
      `;
    }).join('');
  },

  async handleWithdrawalAction(withdrawId, status) {
    if (!['approved', 'rejected'].includes(status)) {
      window.App.showToast('حالة طلب السحب غير صحيحة.', 'error');
      return;
    }

    const withdrawals = window.StorageDB.getWithdrawals();
    const w = withdrawals.find(item => item.id === withdrawId);
    if (!w) {
      window.App.showToast('لم يتم العثور على طلب السحب.', 'error');
      return;
    }

    if (w.status !== 'pending') {
      window.App.showToast('تمت مراجعة هذا الطلب سابقًا ولا يمكن تنفيذ العملية مرتين.', 'warning');
      this.renderWithdrawalsTable();
      return;
    }

    const actionText = status === 'approved' ? 'قبول وتحويل' : 'رفض وإرجاع';
    const confirmMessage = `هل أنت متأكد من رغبتك في ${actionText} طلب السحب هذا؟

اسم العضو: ${w.userName || 'غير محدد'}
المبلغ: ${window.App.formatMoney(w.amount)}
طريقة الدفع: ${this.getWithdrawalMethodLabel(w)}
رقم المحفظة / الحساب: ${this.getWithdrawalAccount(w)}`;
    if (!confirm(confirmMessage)) {
      return;
    }

    const success = await window.StorageDB.updateWithdrawalStatus(withdrawId, status);
    if (success) {
      window.AppAnalytics?.trackWithdrawStatus(w, status);
      window.App.showToast(
        status === 'approved' 
          ? 'تم قبول طلب السحب وتوثيق عملية التحويل.' 
          : 'تم رفض طلب السحب وإعادة المبلغ لحساب المستخدم.',
        status === 'approved' ? 'success' : 'info'
      );

      // إعادة تحميل البيانات حسب الصفحة الحالية
      const path = window.location.pathname.toLowerCase();
      if (path.includes('withdrawals.html')) {
        const searchInput = document.getElementById('withdraw-search');
        const statusFilter = document.getElementById('withdraw-status-filter');
        this.renderWithdrawalsTable(
          searchInput ? searchInput.value : '', 
          statusFilter ? statusFilter.value : 'all'
        );
      } else {
        // إذا كنا باللوحة الرئيسية للأدمن
        this.initStatsDashboard();
      }
    } else {
      window.App.showToast('تعذر تحديث طلب السحب. ربما تمت مراجعته في جلسة أخرى.', 'warning');
      this.renderWithdrawalsTable();
    }
  },

  // ──────────────────────────────────────────────────────────────
  // 5. منطق صفحة الإعدادات العامة (settings.html)
  // ──────────────────────────────────────────────────────────────
  initSettingsPage() {
    // تعبئة البيانات الحالية بالإعدادات المخزنة
    const regToggle = document.getElementById('toggle-registration');
    const withToggle = document.getElementById('toggle-withdrawals');
    const earnInput = document.getElementById('settings-earn-rate');
    const durationInput = document.getElementById('settings-duration');
    const minWithInput = document.getElementById('settings-min-withdraw');
    const maxDailyViewsInput = document.getElementById('settings-max-daily-views');
    const cooldownInput = document.getElementById('settings-cooldown');
    
    if (regToggle) regToggle.checked = this.settings.registrationEnabled;
    if (withToggle) withToggle.checked = this.settings.withdrawalsEnabled;
    if (earnInput) earnInput.value = this.settings.earnPerView;
    if (durationInput) durationInput.value = this.settings.adDuration;
    if (minWithInput) minWithInput.value = this.settings.minWithdraw;
    if (maxDailyViewsInput) maxDailyViewsInput.value = this.settings.maxDailyViews;
    if (cooldownInput) cooldownInput.value = this.settings.cooldownBetweenAds;

    const form = document.getElementById('admin-settings-form');
    if (form) {
      form.onsubmit = (e) => {
        e.preventDefault();

        this.settings.registrationEnabled = regToggle ? regToggle.checked : true;
        this.settings.withdrawalsEnabled = withToggle ? withToggle.checked : true;
        this.settings.earnPerView = parseFloat(earnInput.value);
        this.settings.adDuration = parseInt(durationInput.value);
        this.settings.minWithdraw = parseFloat(minWithInput.value);
        this.settings.maxDailyViews = parseInt(maxDailyViewsInput.value);
        this.settings.cooldownBetweenAds = parseInt(cooldownInput.value);

        window.StorageDB.saveSettings(this.settings);
        window.App.showToast('تم حفظ إعدادات النظام بنجاح.', 'success');
      };
    }
  },

  async initErrorsPage() {
    const tbody = document.getElementById('adm-errors-tbody');
    const refreshBtn = document.getElementById('errors-refresh-btn');
    const typeFilter = document.getElementById('errors-type-filter');
    const render = async () => {
      if (!tbody || !window.FirestoreService?.isAvailable?.()) return;
      tbody.innerHTML = '<tr><td colspan="5" class="text-center">جاري التحميل...</td></tr>';
      let query = window.FirestoreService.db().collection('securityIncidents').orderBy('date', 'desc').limit(50);
      const type = typeFilter ? typeFilter.value : '';
      if (type) query = window.FirestoreService.db().collection('securityIncidents').where('type', '==', type).orderBy('date', 'desc').limit(50);
      try {
        const snapshot = await query.get();
        const rows = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        if (!rows.length) {
          tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">لا توجد أخطاء مسجلة.</td></tr>';
          return;
        }
        tbody.innerHTML = rows.map(item => `
          <tr>
            <td><strong>${item.type || '-'}</strong><br><small>${item.id}</small></td>
            <td>${item.severity || 'medium'}</td>
            <td>${item.detail?.adId || '-'}</td>
            <td>${item.detail?.userId || item.detail?.uid || '-'}</td>
            <td>${item.date || '-'}</td>
          </tr>
        `).join('');
      } catch (error) {
        tbody.innerHTML = `<tr><td colspan="5" class="text-center text-accent">${error.message}</td></tr>`;
      }
    };
    if (refreshBtn) refreshBtn.onclick = render;
    if (typeFilter) typeFilter.onchange = render;
    await render();
  },

  async initExportsPage() {
    const buttons = document.querySelectorAll('[data-export]');
    buttons.forEach(button => {
      button.onclick = async () => {
        const collectionName = button.dataset.export;
        const format = button.dataset.format || 'json';
        await this.exportCollection(collectionName, format);
      };
    });
  },

  async exportCollection(collectionName, format = 'json') {
    if (!window.FirestoreService?.isAvailable?.()) return;
    const allowed = ['users', 'ads', 'withdrawals', 'adAnalytics', 'rewardClaims', 'transactions', 'securityIncidents', 'logs'];
    if (!allowed.includes(collectionName)) {
      window.App.showToast('Collection غير مدعومة للتصدير.', 'error');
      return;
    }
    const snapshot = await window.FirestoreService.db().collection(collectionName).limit(500).get();
    const rows = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    let body = '';
    let mime = 'application/json';
    if (format === 'csv') {
      const keys = [...new Set(rows.flatMap(row => Object.keys(row)))];
      body = [
        keys.join(','),
        ...rows.map(row => keys.map(key => JSON.stringify(row[key] ?? '')).join(','))
      ].join('\n');
      mime = 'text/csv';
    } else {
      body = JSON.stringify({ collection: collectionName, exportedAt: new Date().toISOString(), rows }, null, 2);
    }
    const blob = new Blob([body], { type: `${mime};charset=utf-8` });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${collectionName}-${timestamp}.${format}`;
    link.click();
    URL.revokeObjectURL(link.href);
    window.App.showToast(`تم تصدير ${rows.length} سجل من ${collectionName}.`, 'success');
  }
};

// تشغيل النظام
document.addEventListener('DOMContentLoaded', () => {
  if (window.location.pathname.toLowerCase().includes('ads.html')) {
    Admin.setupAddAdForm();
  }
  Admin.init();
});

window.Admin = Admin;
