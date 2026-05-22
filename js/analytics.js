/* ============================================================
   analytics.js - Google Analytics event tracking helpers
   ============================================================ */

'use strict';

(function () {
  const GA_MEASUREMENT_ID = 'G-KC415206EE';

  function safeNumber(value) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : 0;
  }

  function isReady() {
    return typeof window.gtag === 'function';
  }

  function track(eventName, params = {}) {
    if (!isReady()) return false;
    window.gtag('event', eventName, {
      app_name: 'rabehi',
      page_path: window.location.pathname,
      page_title: document.title,
      ...params
    });
    return true;
  }

  const AppAnalytics = {
    id: GA_MEASUREMENT_ID,

    trackPageView(params = {}) {
      return track('page_view', {
        page_location: window.location.href,
        ...params
      });
    },

    trackPageLoaded(params = {}) {
      return track('page_loaded', {
        page_location: window.location.href,
        ...params
      });
    },

    trackLogin(user = {}) {
      return track('login', {
        method: 'email',
        user_role: user.role || 'user'
      });
    },

    trackRegister(user = {}) {
      return track('sign_up', {
        method: 'email',
        user_role: user.role || 'user',
        value: 5,
        currency: 'EGP'
      });
    },

    trackAdWatchStart(ad = {}) {
      return track('ad_watch_start', {
        ad_id: ad.id || '',
        ad_title: ad.title || '',
        ad_category: ad.category || '',
        ad_type: ad.type || '',
        value: safeNumber(ad.reward),
        currency: 'EGP'
      });
    },

    trackAdCompleted(ad = {}, elapsedSeconds = 0) {
      return track('ad_watch_completed', {
        ad_id: ad.id || '',
        ad_title: ad.title || '',
        ad_category: ad.category || '',
        ad_type: ad.type || '',
        elapsed_seconds: safeNumber(elapsedSeconds),
        value: safeNumber(ad.reward),
        currency: 'EGP'
      });
    },

    trackReward(ad = {}, rewardResult = {}) {
      const rewardAmount = safeNumber(rewardResult.reward || rewardResult.amount || ad.reward);
      track('earn_virtual_currency', {
        virtual_currency_name: 'EGP Reward',
        value: rewardAmount,
        currency: 'EGP'
      });
      return track('reward_claimed', {
        ad_id: ad.id || '',
        ad_title: ad.title || '',
        reward_amount: rewardAmount,
        value: rewardAmount,
        currency: 'EGP'
      });
    },

    trackWithdrawRequest(withdrawal = {}) {
      return track('withdraw_request_submitted', {
        method: withdrawal.methodLabel || withdrawal.method || withdrawal.methodKey || '',
        account_type: withdrawal.methodKey || '',
        value: safeNumber(withdrawal.amount),
        currency: 'EGP'
      });
    },

    trackWithdrawStatus(withdrawal = {}, status = '') {
      return track('withdraw_status_updated', {
        withdrawal_id: withdrawal.id || '',
        status,
        method: withdrawal.methodLabel || withdrawal.method || withdrawal.methodKey || '',
        value: safeNumber(withdrawal.amount),
        currency: 'EGP'
      });
    }
  };

  window.AppAnalytics = AppAnalytics;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => AppAnalytics.trackPageLoaded());
  } else {
    AppAnalytics.trackPageLoaded();
  }
})();
