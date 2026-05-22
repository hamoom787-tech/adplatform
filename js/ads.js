/* ============================================================
   ads.js â€” ÙˆØ§Ø¬Ù‡Ø© Ø§Ù„ØªØ­ÙƒÙ… ÙÙŠ ØªØ´ØºÙŠÙ„ Ø§Ù„Ø¥Ø¹Ù„Ø§Ù†Ø§Øª ÙˆØ§Ù„Ø¹Ø¯Ø§Ø¯ ÙˆØ§Ù„Ø£Ù…Ø§Ù†
   ============================================================ */

'use strict';

const AdsController = {
  user: null,
  settings: null,
  currentAd: null,
  
  // Ù…Ø¤Ø´Ø±Ø§Øª Ø§Ù„ØªØ´ØºÙŠÙ„ Ø§Ù„Ù…Ø­Ù„ÙŠØ© Ø§Ù„Ù…ØªØ²Ø§Ù…Ù†Ø© Ù…Ø¹ AdEngine
  isPlaying: false,
  isCooldown: false,
  secondsElapsed: 0,
  expectedDuration: 0,
  timerInterval: null,
  cooldownInterval: null,
  resetTimerInterval: null,
  
  // ØªØªØ¨Ø¹ Ø­Ø§Ù„Ø© Ø§Ù„ØªØ±ÙƒÙŠØ² ÙÙŠ Ø§Ù„ØµÙØ­Ø© Ù„ØªØ¬Ù†Ø¨ ØªÙƒØ±Ø§Ø± Ø§Ù„Ø£Ø­Ø¯Ø§Ø«
  isPaused: false,
  isListenersAttached: false,
  isLifecycleBound: false,

  cleanupTimers() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
    if (this.cooldownInterval) {
      clearInterval(this.cooldownInterval);
      this.cooldownInterval = null;
    }
  },

  cleanupAllTimers() {
    this.cleanupTimers();
    if (this.resetTimerInterval) {
      clearInterval(this.resetTimerInterval);
      this.resetTimerInterval = null;
    }
  },

  setupLifecycleCleanup() {
    if (this.isLifecycleBound) return;
    window.addEventListener('beforeunload', () => {
      this.cleanupAllTimers();
      if (window.Security) {
        window.Security.endRewardSession('ads-page-unload');
      }
    });
    this.isLifecycleBound = true;
  },

  async init() {
    if (window.Auth && typeof window.Auth.ready === 'function') {
      await window.Auth.ready();
    }
    this.user = window.Auth.refreshSession();
    if (!this.user) return;

    if (window.FirestoreService?.ensureSettings) {
      await window.FirestoreService.ensureSettings();
    }
    if (window.FirestoreService?.ensureAds) {
      await window.FirestoreService.ensureAds();
    }
    this.settings = window.StorageDB.getSettings();

    if (window.Security && window.Security.getRewardSession()) {
      window.Security.endRewardSession('page-refresh');
      window.App.showToast('ØªÙ… Ø¥Ù„ØºØ§Ø¡ Ø¬Ù„Ø³Ø© Ù…Ø´Ø§Ù‡Ø¯Ø© ØºÙŠØ± Ù…ÙƒØªÙ…Ù„Ø© Ø¨Ø¹Ø¯ ØªØ­Ø¯ÙŠØ« Ø§Ù„ØµÙØ­Ø© Ù„Ø­Ù…Ø§ÙŠØ© Ø§Ù„Ù…ÙƒØ§ÙØ¢Øª.', 'warning');
    }

    // ØªÙ‡ÙŠØ¦Ø© Ù…Ø­Ø±Ùƒ Ø§Ù„Ø¥Ø¹Ù„Ø§Ù†Ø§Øª ÙˆØ¨Ù†Ø§Ø¡ Ø·Ø§Ø¨ÙˆØ± Ø§Ù„Ø¹Ø±Ø¶ Ø§Ù„Ù…Ø®ØµØµ
    window.AdEngine.buildQueue();

    // Ø¹Ø±Ø¶ ÙØªØ±Ø© Ø§Ù„ØªÙ‡Ø¯Ø¦Ø© Ø§Ù„Ø§ÙØªØ±Ø§Ø¶ÙŠØ©
    const cooldownDisp = document.getElementById('cooldown-seconds-display');
    if (cooldownDisp) {
      cooldownDisp.textContent = this.settings.cooldownBetweenAds || 5;
    }

    this.renderPageStats();
    this.initDailyResetTimer();
    this.setupPageVisibilityCheck();
    this.setupLifecycleCleanup();
    
    // ØªØ­Ù…ÙŠÙ„ Ø§Ù„Ø¥Ø¹Ù„Ø§Ù† Ø§Ù„Ø£ÙˆÙ„
    this.loadAd();
  },

  // ØªØ­Ø¯ÙŠØ« Ø¥Ø­ØµØ§Ø¦ÙŠØ§Øª Ø§Ù„ØµÙØ­Ø© ÙˆØ§Ù„Ø­Ø¯ÙˆØ¯ Ø§Ù„ÙŠÙˆÙ…ÙŠØ©
  renderPageStats() {
    this.user = window.Auth.refreshSession();
    if (!this.user) return;

    const todayViewsEl = document.getElementById('w-today-views');
    const limitViewsEl = document.getElementById('w-limit-views');

    if (todayViewsEl) todayViewsEl.textContent = this.user.todayViews || 0;
    if (limitViewsEl) limitViewsEl.textContent = this.settings.maxDailyViews || 10;

    // ØªØ­Ø¯ÙŠØ« Ø±ØµÙŠØ¯ Ø§Ù„ØªÙˆØ¨ Ø¨Ø§Ø±
    window.App.renderSharedLayoutData();
  },

  // Ù…Ø¤Ù‚Øª Ø¥Ø¹Ø§Ø¯Ø© ØªØ¹ÙŠÙŠÙ† Ø­Ø¯ Ø§Ù„Ù…Ø´Ø§Ù‡Ø¯Ø© Ø§Ù„ÙŠÙˆÙ…ÙŠ Ø¹Ù†Ø¯ Ù…Ù†ØªØµÙ Ø§Ù„Ù„ÙŠÙ„
  initDailyResetTimer() {
    const timerEl = document.getElementById('w-countdown-reset');
    if (!timerEl) return;

    const updateTimer = () => {
      const now = new Date();
      const midnight = new Date();
      midnight.setHours(24, 0, 0, 0);

      const diff = midnight - now;
      if (diff <= 0) {
        this.resetDailyViews();
        return;
      }

      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      const pad = (num) => String(num).padStart(2, '0');
      timerEl.textContent = `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
    };

    updateTimer();
    clearInterval(this.resetTimerInterval);
    this.resetTimerInterval = setInterval(updateTimer, 1000);
  },

  resetDailyViews() {
    this.user = window.Auth.refreshSession();
    if (!this.user) return;

    this.user.todayViews = 0;
    this.user.lastWatchDate = new Date().toISOString().split('T')[0];
    if (window.AuthService && typeof window.AuthService.setCurrentUserProfile === 'function') {
      window.AuthService.setCurrentUserProfile({ ...this.user });
    }

    this.renderPageStats();
    window.App.showToast('ØªÙ… Ø¨Ø¯Ø¡ ÙŠÙˆÙ… Ø¬Ø¯ÙŠØ¯ ÙˆØ¥Ø¹Ø§Ø¯Ø© ØªØ¹ÙŠÙŠÙ† Ù…Ø´Ø§Ù‡Ø¯Ø§ØªÙƒ Ø§Ù„ÙŠÙˆÙ…ÙŠØ© Ø¨Ù†Ø¬Ø§Ø­!', 'info');
  },

  // ØªØ­Ù…ÙŠÙ„ ØªÙØ§ØµÙŠÙ„ Ø§Ù„Ø¥Ø¹Ù„Ø§Ù† ÙˆØ¹Ø±Ø¶ Ø­Ø§Ù„Ø© Ø§Ù„Ø§Ø³ØªØ¹Ø¯Ø§Ø¯
  loadAd() {
    this.cleanupTimers();
    this.user = window.Auth.refreshSession();
    if (!this.user) return;
    this.settings = window.StorageDB.getSettings();

    this.currentAd = window.AdEngine.getNextAd();
    
    const titleEl = document.getElementById('ad-title');
    const descEl = document.getElementById('ad-desc');
    const categoryEl = document.getElementById('ad-category');
    const rewardEl = document.getElementById('ad-reward');
    const startBtn = document.getElementById('start-ad-btn');
    const nextBtn = document.getElementById('next-ad-btn');
    const statusMsgEl = document.getElementById('ad-status-msg');

    // ØªØ¨Ø¯ÙŠÙ„ ÙˆØ§Ø¬Ù‡Ø§Øª Ø§Ù„Ø¹Ø±Ø¶ Ù„ÙˆØ¶Ø¹ Ø§Ù„Ø§Ø³ØªØ¹Ø¯Ø§Ø¯ (Idle)
    document.getElementById('ad-idle-view').style.display = 'flex';
    document.getElementById('ad-sandbox-viewport').style.display = 'none';
    document.getElementById('ad-error-display').style.display = 'none';
    document.getElementById('ad-skeleton').style.display = 'none';

    if (!this.currentAd) {
      if (titleEl) titleEl.textContent = 'Ù„Ø§ ØªÙˆØ¬Ø¯ Ø¥Ø¹Ù„Ø§Ù†Ø§Øª Ù†Ø´Ø·Ø© Ø­Ø§Ù„ÙŠØ§Ù‹ ðŸ“º';
      if (descEl) descEl.textContent = 'ÙŠØ±Ø¬Ù‰ Ù…Ø±Ø§Ø¬Ø¹Ø© Ø§Ù„Ø¥Ø¯Ø§Ø±Ø© Ù„Ø¥Ø¶Ø§ÙØ© Ø¥Ø¹Ù„Ø§Ù†Ø§Øª Ø¬Ø¯ÙŠØ¯Ø© Ø£Ùˆ ØªÙØ¹ÙŠÙ„ Ø§Ù„Ù…Ø¹Ø·Ù„ Ù…Ù†Ù‡Ø§.';
      if (startBtn) startBtn.disabled = true;
      return;
    }

    this.expectedDuration = this.currentAd.duration || 15;

    if (categoryEl) categoryEl.textContent = this.currentAd.category || 'Ø¹Ø§Ù…';
    if (rewardEl) rewardEl.textContent = window.App.formatMoney(this.currentAd.reward);
    if (titleEl) titleEl.textContent = this.currentAd.title;
    if (descEl) descEl.textContent = `Ø´Ø§Ù‡Ø¯ Ù‡Ø°Ø§ Ø§Ù„Ø¥Ø¹Ù„Ø§Ù† Ù„Ù…Ø¯Ø© ${this.expectedDuration} Ø«ÙˆØ§Ù†Ù Ù„Ù„Ø­ØµÙˆÙ„ Ø¹Ù„Ù‰ Ù…ÙƒØ§ÙØ£ØªÙƒ Ø¨Ø§Ù„Ø¬Ù†ÙŠÙ‡. Ø§Ù„Ø±Ø¬Ø§Ø¡ Ø¹Ø¯Ù… Ù…ØºØ§Ø¯Ø±Ø© Ø§Ù„ØµÙØ­Ø©.`;

    if (statusMsgEl) {
      statusMsgEl.innerHTML = '';
      statusMsgEl.className = '';
    }

    if (startBtn) {
      startBtn.style.display = 'inline-flex';
      startBtn.disabled = false;
      startBtn.innerHTML = 'â–¶ Ø¨Ø¯Ø¡ Ø§Ù„Ù…Ø´Ø§Ù‡Ø¯Ø©';
      
      // Ø§Ù„ØªØ­Ù‚Ù‚ Ù…Ù† ØªØ¬Ø§ÙˆØ² Ø§Ù„Ø­Ø¯ Ø§Ù„ÙŠÙˆÙ…ÙŠ Ù„Ù„Ù…Ø´Ø§Ù‡Ø¯Ø§Øª Ù„Ù„Ù…Ø³ØªØ®Ø¯Ù…
      if (this.user.todayViews >= this.settings.maxDailyViews) {
        startBtn.disabled = true;
        startBtn.innerHTML = 'âœ‹ ØªØ¬Ø§ÙˆØ²Øª Ø§Ù„Ø­Ø¯ Ø§Ù„ÙŠÙˆÙ…ÙŠ';
        if (statusMsgEl) {
          statusMsgEl.innerHTML = '<span class="text-accent">Ù„Ù‚Ø¯ Ø§Ø³ØªÙ†ÙØ¯Øª ÙƒØ§Ù…Ù„ Ù…Ø´Ø§Ù‡Ø¯Ø§ØªÙƒ Ø§Ù„ÙŠÙˆÙ…ÙŠØ© Ø§Ù„Ù…ØªØ§Ø­Ø©. Ø¹Ø¯ Ù„Ù„Ø±Ø¨Ø­ ØºØ¯Ø§Ù‹!</span>';
        }
      }
    }

    if (nextBtn) nextBtn.style.display = 'none';

    this.resetTimerCanvas();
    this.updateProgressBar(0);

    // Ø±Ø¨Ø· Ø§Ù„Ø£Ø­Ø¯Ø§Ø« Ø¨Ø§Ù„Ø£Ø²Ø±Ø§Ø±
    if (startBtn) {
      startBtn.onclick = () => this.startWatching();
    }
    if (nextBtn) {
      nextBtn.onclick = () => this.nextAd();
    }
  },

  // Ø¨Ø¯Ø¡ ØªØ´ØºÙŠÙ„ ÙˆØ¹Ø±Ø¶ Ø§Ù„Ø¥Ø¹Ù„Ø§Ù†
  async startWatching() {
    if (this.isPlaying || this.isCooldown) return;
    this.cleanupTimers();

    this.user = window.Auth.refreshSession();
    if (!this.user) return;

    if (window.Security && !window.Security.recordAction('watch_button', 5, 2000)) {
      window.App.showToast('ØªÙ… Ø±ØµØ¯ Ø¶ØºØ·Ø§Øª Ù…ØªÙƒØ±Ø±Ø© Ø¨Ø³Ø±Ø¹Ø© ØºÙŠØ± Ø·Ø¨ÙŠØ¹ÙŠØ©. Ø§Ù†ØªØ¸Ø± Ù„Ø­Ø¸Ø© Ø«Ù… Ø­Ø§ÙˆÙ„ Ù…Ø±Ø© Ø£Ø®Ø±Ù‰.', 'warning');
      return;
    }

    const remainingCooldown = window.Security ? window.Security.getRemainingCooldown(this.user.id) : 0;
    if (remainingCooldown > 0) {
      window.App.showToast(`ÙŠØ¬Ø¨ Ø§Ù†ØªØ¸Ø§Ø± ${remainingCooldown} Ø«Ø§Ù†ÙŠØ© Ù‚Ø¨Ù„ Ù…Ø´Ø§Ù‡Ø¯Ø© Ø¥Ø¹Ù„Ø§Ù† Ø¬Ø¯ÙŠØ¯.`, 'warning');
      this.startCooldown(remainingCooldown);
      return;
    }

    if (this.user.todayViews >= this.settings.maxDailyViews) {
      window.App.showToast('Ù„Ø§ ÙŠÙ…ÙƒÙ†Ùƒ Ù…Ø´Ø§Ù‡Ø¯Ø© Ø§Ù„Ù…Ø²ÙŠØ¯ Ù…Ù† Ø§Ù„Ø¥Ø¹Ù„Ø§Ù†Ø§Øª Ø§Ù„ÙŠÙˆÙ…!', 'warning');
      return;
    }

    this.isPlaying = true;
    this.isPaused = false;
    this.secondsElapsed = 0;

    // ØªØ¨Ø¯ÙŠÙ„ Ù„ÙˆØ­Ø§Øª Ø§Ù„Ø¹Ø±Ø¶
    document.getElementById('ad-idle-view').style.display = 'none';
    document.getElementById('ad-sandbox-viewport').style.display = 'block';

    const startBtn = document.getElementById('start-ad-btn');
    const statusMsgEl = document.getElementById('ad-status-msg');

    if (startBtn) {
      startBtn.disabled = true;
      startBtn.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Ø¬Ø§Ø±ÙŠ Ø§Ù„ØªØ­Ù…ÙŠÙ„...';
    }

    if (statusMsgEl) {
      statusMsgEl.innerHTML = '<span class="text-secondary"><i class="fa fa-eye"></i> ÙŠØªÙ… Ø§Ù„Ø¢Ù† ØªØ­Ù…ÙŠÙ„ ÙˆØ¹Ø±Ø¶ Ø§Ù„Ø¥Ø¹Ù„Ø§Ù† Ø§Ù„Ù…Ø¹Ø²ÙˆÙ„...</span>';
    }

    // Ù…Ø²Ø§Ù…Ù†Ø© Ø­Ø§Ù„Ø© Ø§Ù„ØªØ´ØºÙŠÙ„ ÙˆØ§Ù„Ø£Ù…Ø§Ù† Ù…Ø¹ AdEngine
    window.AdEngine.isPlaying = true;
    window.AdEngine.expectedDuration = this.expectedDuration;
    
    // Ø¥Ù†Ø´Ø§Ø¡ Ø¬Ù„Ø³Ø© Ø£Ù…Ø§Ù† ÙØ±ÙŠØ¯Ø© Ù„Ù…Ù†Ø¹ Ø§Ù„ØªÙ„Ø§Ø¹Ø¨
    const sessionResult = window.BackendService && window.BackendService.isAvailable()
      ? await window.BackendService.startRewardSession({
        adId: this.currentAd.id,
        fingerprintHash: window.Security?.getFingerprintHash?.() || '',
        tabId: window.Security?.tabId || ''
      })
      : { valid: false, reason: 'Render Backend ØºÙŠØ± Ù…ØªØ§Ø­Ø© Ø­Ø§Ù„ÙŠØ§ Ù„Ø¥Ù†Ø´Ø§Ø¡ Ø¬Ù„Ø³Ø© Ù…Ø´Ø§Ù‡Ø¯Ø© Ø¢Ù…Ù†Ø©.' };
    const secureSession = sessionResult?.valid && window.Security
      ? window.Security.saveServerRewardSession(sessionResult.session, this.currentAd, this.expectedDuration)
      : null;
    if (window.Security && !secureSession) {
      this.isPlaying = false;
      window.AdEngine.isPlaying = false;
      window.App.showToast('ØªØ¹Ø°Ø± Ø¥Ù†Ø´Ø§Ø¡ Ø¬Ù„Ø³Ø© Ù…Ø´Ø§Ù‡Ø¯Ø© Ø¢Ù…Ù†Ø©. ÙŠØ±Ø¬Ù‰ Ø§Ù„Ù…Ø­Ø§ÙˆÙ„Ø© Ù…Ø±Ø© Ø£Ø®Ø±Ù‰.', 'error');
      this.loadAd();
      return;
    }

    // Ø­Ù‚Ù† Ø§Ù„Ø¥Ø¹Ù„Ø§Ù† ÙÙŠ Ø§Ù„Ù€ Sandbox
    const container = document.getElementById('ad-sandbox-viewport');
    window.AppAnalytics?.trackAdWatchStart(this.currentAd);
    window.AdEngine.renderAd(this.currentAd, container);

    // ØªØ´ØºÙŠÙ„ Ø§Ù„Ø¹Ø¯Ø§Ø¯
    this.runTimer();
  },

  // Ø¥Ø¯Ø§Ø±Ø© ÙˆØªØ´ØºÙŠÙ„ Ø§Ù„Ø¹Ø¯Ø§Ø¯ Ø§Ù„Ø²Ù…Ù†ÙŠ Ù„Ù„ØªÙ‚Ø¯Ù…
  runTimer() {
    const canvas = document.getElementById('timer-canvas');
    const remaining = () => this.expectedDuration - this.secondsElapsed;

    this.drawCircularTimer(canvas, remaining(), this.expectedDuration);

    clearInterval(this.timerInterval);
    this.timerInterval = setInterval(() => {
      if (this.isPaused) return;

      this.secondsElapsed++;
      const rem = remaining();
      
      this.drawCircularTimer(canvas, rem, this.expectedDuration);
      this.updateProgressBar((this.secondsElapsed / this.expectedDuration) * 100);

      // ØªØ­Ø¯ÙŠØ« Ø±Ø³Ø§Ù„Ø© Ø§Ù„Ø­Ø§Ù„Ø©
      const statusMsgEl = document.getElementById('ad-status-msg');
      if (statusMsgEl) {
        statusMsgEl.innerHTML = `<span class="text-secondary"><i class="fa fa-eye"></i> Ø¬Ø§Ø±ÙŠ Ø§Ù„Ù…Ø´Ø§Ù‡Ø¯Ø©... ØªØ¨Ù‚Ù‰ ${rem} Ø«Ø§Ù†ÙŠØ©.</span>`;
      }

      if (this.secondsElapsed >= this.expectedDuration) {
        clearInterval(this.timerInterval);
        this.creditReward();
      }
    }, 1000);
  },

  // Ø¥ÙŠÙ‚Ø§Ù ÙˆØ§Ø³ØªØ¦Ù†Ø§Ù Ø§Ù„Ø¹Ø¯Ø§Ø¯ Ù…Ø¤Ù‚ØªØ§Ù‹
  pauseTimer() {
    if (!this.isPlaying || this.isPaused) return;
    this.isPaused = true;

    const startBtn = document.getElementById('start-ad-btn');
    if (startBtn) startBtn.innerHTML = 'â¸ Ù…Ø´Ø§Ù‡Ø¯Ø© Ù…Ø¹Ù„Ù‚Ø©';

    const statusMsgEl = document.getElementById('ad-status-msg');
    if (statusMsgEl) {
      statusMsgEl.innerHTML = '<span class="text-warning"><i class="fa fa-pause-circle"></i> ØªÙ… Ø¥ÙŠÙ‚Ø§Ù Ø§Ù„Ù…Ø´Ø§Ù‡Ø¯Ø© Ù…Ø¤Ù‚ØªØ§Ù‹ Ù„Ù…ØºØ§Ø¯Ø±ØªÙƒ Ø§Ù„ØªØ¨ÙˆÙŠØ¨ Ø£Ùˆ ÙÙ‚Ø¯Ø§Ù† Ø§Ù„ØªØ±ÙƒÙŠØ²! Ø¹Ø¯ Ù„Ù…ØªØ§Ø¨Ø¹Ø© Ø§Ù„ØªÙ‚Ø¯Ù….</span>';
    }
  },

  resumeTimer() {
    if (!this.isPlaying || !this.isPaused) return;
    this.isPaused = false;

    const startBtn = document.getElementById('start-ad-btn');
    if (startBtn) startBtn.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Ø¬Ø§Ø±ÙŠ Ø§Ù„Ù…Ø´Ø§Ù‡Ø¯Ø©...';

    const statusMsgEl = document.getElementById('ad-status-msg');
    if (statusMsgEl) {
      statusMsgEl.innerHTML = '<span class="text-secondary"><i class="fa fa-eye"></i> ØªÙ… Ø§Ø³ØªØ¦Ù†Ø§Ù Ø§Ù„Ù…Ø´Ø§Ù‡Ø¯Ø© Ø¨Ù†Ø¬Ø§Ø­...</span>';
    }
  },

  // Ø¥Ø¹Ø¯Ø§Ø¯ Ø­Ù…Ø§ÙŠØ© Ø§Ù„Ø®Ø±ÙˆØ¬ Ù…Ù† Ø§Ù„ØªØ¨ÙˆÙŠØ¨ ÙˆØ§Ù„ØªØ±ÙƒÙŠØ²
  setupPageVisibilityCheck() {
    if (this.isListenersAttached) return;

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.pauseTimer();
      } else {
        this.resumeTimer();
      }
    });

    window.addEventListener('blur', () => {
      this.pauseTimer();
    });

    window.addEventListener('focus', () => {
      this.resumeTimer();
    });

    this.isListenersAttached = true;
  },

  // Ø§Ø­ØªØ³Ø§Ø¨ Ø§Ù„Ø¬Ø§Ø¦Ø²Ø© ÙˆØ§Ù„ØªØ­Ù‚Ù‚ Ù…Ù† Ø±Ù…ÙˆØ² Ø§Ù„Ø£Ù…Ø§Ù† ÙˆØ§Ù„Ù†Ø²Ø§Ù‡Ø©
  async creditReward() {
    if (!this.isPlaying) return;
    this.isPlaying = false;
    window.AdEngine.isPlaying = false;
    this.cleanupTimers();

    // Ø§Ù„ØªØ­Ù‚Ù‚ Ù…Ù† Ø±Ù…Ø² Ø£Ù…Ø§Ù† Ø¬Ù„Ø³Ø© Ø§Ù„Ù…Ø´Ø§Ù‡Ø¯Ø© Ù„Ù…Ù†Ø¹ Ù…Ø­Ø§ÙˆÙ„Ø§Øª Ø§Ù„ØªÙ„Ø§Ø¹Ø¨ Ø£Ùˆ Ø§Ù„ØªÙ‚Ø¯Ù… Ø§Ù„Ø³Ø±ÙŠØ¹ Ø¨Ø§Ù„ÙˆÙ‚Øª
    const verification = window.AdEngine.verifyAdSession(this.currentAd.id);
    if (!verification.valid) {
      window.FirestoreService?.reportSecurityIncident?.('reward-verification-failed', {
        userId: this.user?.id,
        adId: this.currentAd?.id,
        reason: verification.reason
      });
      window.App.showToast(`ÙØ´Ù„ Ø§Ø­ØªØ³Ø§Ø¨ Ø§Ù„Ø¬Ø§Ø¦Ø²Ø©: ${verification.reason}`, 'error');
      
      // ØªÙ†Ø¸ÙŠÙ Ù…Ø­Ø§ÙŠØ¯ Ù„Ù„ÙˆØ§Ø¬Ù‡Ø© ÙˆØ¥Ù„ØºØ§Ø¡ Ù…Ø­Ø§ÙˆÙ„Ø© Ø§Ù„Ø§Ø­ØªØ³Ø§Ø¨
      this.resetTimerCanvas();
      this.loadAd();
      return;
    }

    this.user = window.Auth.refreshSession();
    if (!this.user) return;

    const rewardResult = await window.StorageDB.claimReward({
      user: this.user,
      ad: this.currentAd,
      session: verification.session,
      elapsedSeconds: this.expectedDuration
    });

    if (!rewardResult.valid) {
      window.App.showToast(`ÙØ´Ù„ Ø§Ø­ØªØ³Ø§Ø¨ Ø§Ù„Ø¬Ø§Ø¦Ø²Ø©: ${rewardResult.reason}`, 'error');
      this.resetTimerCanvas();
      this.loadAd();
      return;
    }

    this.user = rewardResult.user || window.Auth.refreshSession();
    window.AppAnalytics?.trackAdCompleted(this.currentAd, this.expectedDuration);
    window.AppAnalytics?.trackReward(this.currentAd, {
      reward: this.currentAd?.reward,
      userId: this.user?.id
    });

    // ØªØ­Ø¯ÙŠØ« Ø¥Ø­ØµØ§Ø¦ÙŠØ§Øª Ø§Ù„ØµÙØ­Ø©
    this.renderPageStats();

    // Ø¥Ø·Ù„Ø§Ù‚ Ù…Ø¤Ø«Ø± Ø§Ù„Ù†Ø¬Ø§Ø­ Ø§Ù„Ø¨ØµØ±ÙŠ (Success Overlay)
    const successOverlay = document.getElementById('ad-success-overlay');
    if (successOverlay) {
      successOverlay.classList.add('show');
      setTimeout(() => {
        successOverlay.classList.remove('show');
        // Ø¨Ø¯Ø¡ ÙØªØ±Ø© Ø§Ù„ØªÙ‡Ø¯Ø¦Ø© Ø§Ù„Ø¥Ù„Ø²Ø§Ù…ÙŠØ© Ø¨Ø¹Ø¯ Ø¥ØºÙ„Ø§Ù‚ Ø§Ù„Ù…Ø¤Ø«Ø±
        this.startCooldown();
      }, 2500);
    } else {
      this.startCooldown();
    }

    // Ø±Ø³Ù… Ø¹Ù„Ø§Ù…Ø© Ø§Ù„Ù†Ø¬Ø§Ø­ Ø¹Ù„Ù‰ Ø§Ù„ÙƒØ§Ù†ÙØ§Ø³ ÙˆØ´Ø±ÙŠØ· Ø§Ù„ØªÙ‚Ø¯Ù…
    const canvas = document.getElementById('timer-canvas');
    this.drawCircularTimer(canvas, 0, this.expectedDuration, true);
    this.updateProgressBar(100);
  },

  // ØªØ´ØºÙŠÙ„ ÙØªØ±Ø© Ø§Ù„ØªÙ‡Ø¯Ø¦Ø© Ø§Ù„Ø¥Ø¬Ø¨Ø§Ø±ÙŠØ© (Cooldown System)
  startCooldown(forcedSeconds = null) {
    this.isCooldown = true;
    this.user = window.Auth.refreshSession();
    let cooldownRemaining = forcedSeconds !== null ? forcedSeconds : (this.settings.cooldownBetweenAds || 5);
    if (window.Security && this.user && forcedSeconds === null) {
      window.Security.setCooldown(this.user.id, cooldownRemaining);
    }

    const startBtn = document.getElementById('start-ad-btn');
    const nextBtn = document.getElementById('next-ad-btn');
    const statusMsgEl = document.getElementById('ad-status-msg');

    if (startBtn) startBtn.style.display = 'none';
    if (nextBtn) {
      nextBtn.style.display = 'inline-flex';
      nextBtn.disabled = true;
      nextBtn.innerHTML = `Ø§Ù„Ø±Ø¬Ø§Ø¡ Ø§Ù„Ø§Ù†ØªØ¸Ø§Ø± (${cooldownRemaining}Ø«)`;
    }

    if (statusMsgEl) {
      statusMsgEl.innerHTML = '<span class="text-warning"><i class="fa fa-hourglass-half"></i> ÙØªØ±Ø© ØªÙ‡Ø¯Ø¦Ø© Ø¥Ø¬Ø¨Ø§Ø±ÙŠØ© Ù„Ø­Ù…Ø§ÙŠØ© Ø§Ù„Ø®Ø§Ø¯Ù… ÙˆÙ…Ù†Ø¹ ØªÙƒØ±Ø§Ø± Ø§Ù„Ø·Ù„Ø¨Ø§Øª ØºÙŠØ± Ø§Ù„Ø´Ø±Ø¹ÙŠØ©...</span>';
    }

    clearInterval(this.cooldownInterval);
    this.cooldownInterval = setInterval(() => {
      cooldownRemaining--;
      if (nextBtn) {
        nextBtn.innerHTML = `Ø§Ù„Ø±Ø¬Ø§Ø¡ Ø§Ù„Ø§Ù†ØªØ¸Ø§Ø± (${cooldownRemaining}Ø«)`;
      }

      if (cooldownRemaining <= 0) {
        clearInterval(this.cooldownInterval);
        this.isCooldown = false;

        if (nextBtn) {
          nextBtn.disabled = false;
          nextBtn.innerHTML = 'Ø§Ù„Ø¥Ø¹Ù„Ø§Ù† Ø§Ù„ØªØ§Ù„ÙŠ â†';
        }

        if (statusMsgEl) {
          statusMsgEl.innerHTML = '<span class="text-success"><i class="fa fa-check-circle"></i> ÙŠÙ…ÙƒÙ†Ùƒ Ø§Ù„Ø¢Ù† Ø§Ù„Ø§Ù†ØªÙ‚Ø§Ù„ Ù„Ù…Ø´Ø§Ù‡Ø¯Ø© Ø§Ù„Ø¥Ø¹Ù„Ø§Ù† Ø§Ù„ØªØ§Ù„ÙŠ.</span>';
        }
      }
    }, 1000);
  },

  // Ø§Ù„Ø§Ù†ØªÙ‚Ø§Ù„ ÙˆØªØ­Ù…ÙŠÙ„ Ø§Ù„Ø¥Ø¹Ù„Ø§Ù† Ø§Ù„ØªØ§Ù„ÙŠ
  nextAd() {
    if (this.isPlaying || this.isCooldown) return;
    this.user = window.Auth.refreshSession();
    const remainingCooldown = window.Security && this.user ? window.Security.getRemainingCooldown(this.user.id) : 0;
    if (remainingCooldown > 0) {
      this.startCooldown(remainingCooldown);
      return;
    }
    this.loadAd();
  },

  // Ø±Ø³Ù… Ø§Ù„Ø¹Ø¯Ø§Ø¯ Ø§Ù„Ø¯Ø§Ø¦Ø±ÙŠ Ø¹Ù„Ù‰ Canvas
  drawCircularTimer(canvas, remaining, total, done = false) {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const r = cx - 10;
    const progress = done ? 1 : (total - remaining) / total;
    const endAngle = progress * 2 * Math.PI - Math.PI / 2;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 1. Ø±Ø³Ù… Ø§Ù„Ø¯Ø§Ø¦Ø±Ø© Ø§Ù„Ø®Ù„ÙÙŠØ© Ø§Ù„Ø±Ù…Ø§Ø¯ÙŠØ©
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, 2 * Math.PI);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 8;
    ctx.stroke();

    // 2. Ø±Ø³Ù… Ø´Ø±ÙŠØ· Ø§Ù„ØªÙ‚Ø¯Ù… Ø§Ù„Ù†Ø´Ø· Ø§Ù„Ù…ØªØ¯Ø±Ø¬
    if (progress > 0) {
      const gradient = ctx.createLinearGradient(0, 0, canvas.width, 0);
      gradient.addColorStop(0, '#7000ff');
      gradient.addColorStop(1, '#00ffc4');

      ctx.beginPath();
      ctx.arc(cx, cy, r, -Math.PI / 2, endAngle);
      ctx.strokeStyle = done ? '#00ffc4' : gradient;
      ctx.lineWidth = 8;
      ctx.lineCap = 'round';
      ctx.stroke();
    }

    // 3. ÙƒØªØ§Ø¨Ø© Ø§Ù„Ù†Øµ ÙˆÙ…Ø³ØªÙˆÙ‰ Ø§Ù„Ø¹Ø¯Ø§Ø¯ Ø¨Ø§Ù„Ø¯Ø§Ø®Ù„
    ctx.fillStyle = done ? '#00ffc4' : '#ffffff';
    ctx.font = 'bold 24px Cairo, Tajawal, Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    if (done) {
      ctx.fillText('âœ“', cx, cy);
    } else {
      ctx.fillText(`${remaining}Ø«`, cx, cy);
    }
  },

  resetTimerCanvas() {
    const canvas = document.getElementById('timer-canvas');
    if (canvas) {
      this.drawCircularTimer(canvas, this.expectedDuration, this.expectedDuration);
    }
  },

  updateProgressBar(percentage) {
    const fillEl = document.getElementById('ad-progress-fill');
    if (fillEl) {
      fillEl.style.width = `${Math.min(percentage, 100)}%`;
    }
  }
};

// ØªÙ‡ÙŠØ¦Ø© ÙˆØªØ´ØºÙŠÙ„ Ø§Ù„ÙˆØ§Ø¬Ù‡Ø© Ø¹Ù†Ø¯ Ø¬Ø§Ù‡Ø²ÙŠØ© Ù…Ø³ØªÙ†Ø¯ Ø§Ù„ØµÙØ­Ø©
document.addEventListener('DOMContentLoaded', () => {
  AdsController.init();
});

window.AdsController = AdsController;

