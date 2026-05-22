/* ============================================================
   ad-engine.js — المحرك المركزي لإدارة دورة حياة الإعلانات والعزل والأمان
   ============================================================ */

'use strict';

const AdEngine = {
  queue: [],
  currentIndex: -1,
  currentAd: null,
  
  // مؤقتات دورة حياة الإعلان
  timerInterval: null,
  watchdogTimeout: null,
  
  // حالة الإعلان الحالية
  isPlaying: false,
  isCooldown: false,
  secondsElapsed: 0,
  expectedDuration: 0,
  startTime: null,
  
  // الإعلان الأخير الذي تم عرضه لمنع التكرار المتتالي
  lastAdId: null,
  isInitialized: false,

  // تهيئة مستمع رسائل الكراش من الـ Sandboxed iframe
  init() {
    if (this.isInitialized) return;
    window.addEventListener('message', (event) => {
      // التحقق من صحة الرسالة القادمة من الـ Iframe المعزول
      if (event.data && event.data.type === 'ad_crash') {
        const errorMsg = event.data.error || 'خطأ غير معروف في السكريبت';
        const adId = event.data.adId;
        
        window.FirestoreService?.reportSecurityIncident?.('ad-crash', { adId, errorMsg });
        
        // إذا كان هذا هو الإعلان النشط حالياً، قم بتشغيل نظام الاسترداد
        if (this.currentAd && this.currentAd.id === adId) {
          this.handleCrash(errorMsg);
        }
      }
    });
    this.isInitialized = true;
  },

  // إنشاء قائمة تشغيل الإعلانات المحسنة
  buildQueue() {
    const allAds = window.StorageDB.getAds();
    // تصفية الإعلانات النشطة وغير المعطلة بسبب أخطاء
    const activeAds = allAds.filter(a => a.active && a.status !== 'error');
    
    if (activeAds.length === 0) {
      this.queue = [];
      return;
    }

    if (activeAds.length === 1) {
      this.queue = [...activeAds];
      return;
    }

    // خوارزمية ترتيب عشوائي Fisher-Yates
    let shuffled = [...activeAds];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    // تجنب بدء القائمة بنفس الإعلان الأخير
    if (this.lastAdId && shuffled[0].id === this.lastAdId) {
      for (let i = 1; i < shuffled.length; i++) {
        if (shuffled[i].id !== this.lastAdId) {
          [shuffled[0], shuffled[i]] = [shuffled[i], shuffled[0]];
          break;
        }
      }
    }

    // تجنب التكرار المتتالي داخل القائمة
    for (let i = 0; i < shuffled.length - 1; i++) {
      if (shuffled[i].id === shuffled[i + 1].id) {
        for (let j = i + 2; j < shuffled.length; j++) {
          if (shuffled[j].id !== shuffled[i].id) {
            [shuffled[i + 1], shuffled[j]] = [shuffled[j], shuffled[i + 1]];
            break;
          }
        }
      }
    }

    this.queue = shuffled;
    this.currentIndex = 0;
  },

  // الانتقال للإعلان التالي
  getNextAd() {
    if (this.queue.length === 0) {
      this.buildQueue();
    }
    
    if (this.queue.length === 0) {
      return null;
    }

    if (this.currentIndex >= this.queue.length) {
      // إعادة إنشاء القائمة بعد انتهائها للحصول على ترتيب عشوائي جديد
      this.buildQueue();
    }

    const ad = this.queue[this.currentIndex];
    this.currentIndex++;
    
    if (ad) {
      this.lastAdId = ad.id;
    }
    return ad;
  },

  // تنظيف وإعادة تعيين الحاوية ومنع تسريبات الذاكرة
  clearContainer(container) {
    if (!container) return;
    
    // إزالة وتفريغ جميع الـ iframes الموجودة لمنع تسريب الذاكرة والسكريبتات المعلقة
    const iframes = container.querySelectorAll('iframe');
    iframes.forEach(iframe => {
      try {
        iframe.onload = null;
        iframe.onerror = null;
        iframe.src = 'about:blank';
      } catch (e) {
        window.FirestoreService?.reportSecurityIncident?.('iframe-unload-failed', { message: e.message });
      }
      iframe.remove();
    });

    container.innerHTML = '';
    
    // إزالة السkeletons وأي رسائل خطأ سابقة
    const skeleton = document.getElementById('ad-skeleton');
    if (skeleton) skeleton.style.display = 'none';
    
    const errorDisplay = document.getElementById('ad-error-display');
    if (errorDisplay) errorDisplay.style.display = 'none';
  },

  buildVastPlayerDoc(ad) {
    const serializeForScript = value => JSON.stringify(String(value || ''))
      .replace(/</g, '\\u003C')
      .replace(/>/g, '\\u003E')
      .replace(/&/g, '\\u0026');
    const vastSource = serializeForScript(ad.code);
    const vastProxy = serializeForScript(window.BackendService?.vastProxyEndpoint || '');
    const adId = serializeForScript(ad.id || 'vast-ad');
    const adTitle = serializeForScript(ad.title || 'VAST Video Ad');

    return `
      <!DOCTYPE html>
      <html lang="ar" dir="rtl">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          * { box-sizing: border-box; }
          body {
            margin: 0;
            min-height: 100vh;
            background: #10111f;
            color: #fffffe;
            font-family: Arial, sans-serif;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 14px;
          }
          .vast-shell {
            width: 100%;
            max-width: 980px;
            min-height: 190px;
            display: flex;
            align-items: center;
            justify-content: center;
            position: relative;
            border: 1px solid rgba(108, 99, 255, 0.28);
            border-radius: 12px;
            overflow: hidden;
            background: radial-gradient(circle at top, rgba(0, 212, 170, 0.12), rgba(16, 17, 31, 0.96) 55%);
          }
          video {
            width: 100%;
            height: 100%;
            min-height: 190px;
            max-height: 420px;
            display: none;
            background: #05050b;
            object-fit: contain;
          }
          .state {
            width: 100%;
            padding: 24px;
            text-align: center;
            line-height: 1.8;
          }
          .state strong { color: #00d4aa; display: block; margin-bottom: 6px; }
          .state small { color: #a7a9be; display: block; font-size: 12px; }
          .error strong { color: #ff6b6b; }
          .clickthrough {
            position: absolute;
            bottom: 12px;
            left: 12px;
            display: none;
            padding: 8px 14px;
            border-radius: 8px;
            color: #fff;
            text-decoration: none;
            font-weight: 700;
            font-size: 12px;
            background: linear-gradient(135deg, #6c63ff, #00d4aa);
          }
        </style>
      </head>
      <body>
        <div class="vast-shell">
          <video id="vast-video" controls muted playsinline preload="auto"></video>
          <a id="vast-click" class="clickthrough" target="_blank" rel="noopener noreferrer">زيارة الإعلان</a>
          <div id="vast-state" class="state">
            <strong>جاري تحميل إعلان الفيديو...</strong>
            <small>${String(ad.title || 'VAST Video Ad').replace(/[<>&]/g, '')}</small>
          </div>
        </div>

        <script>
          const VAST_SOURCE = ${vastSource};
          const VAST_PROXY_URL = ${vastProxy};
          const AD_ID = ${adId};
          const AD_TITLE = ${adTitle};
          const stateEl = document.getElementById('vast-state');
          const videoEl = document.getElementById('vast-video');
          const clickEl = document.getElementById('vast-click');
          const fired = Object.create(null);

          function showStatus(title, detail) {
            stateEl.className = 'state';
            stateEl.style.display = 'block';
            stateEl.innerHTML = '<strong>' + title + '</strong><small>' + (detail || '') + '</small>';
          }

          function showError(detail) {
            stateEl.className = 'state error';
            stateEl.style.display = 'block';
            stateEl.innerHTML = '<strong>تعذر تشغيل إعلان الفيديو</strong><small>' + detail + '</small>';
          }

          function reportCrash(message) {
            showError(message);
            window.parent.postMessage({ type: 'ad_crash', error: message, adId: AD_ID }, '*');
          }

          function text(node, tag) {
            const child = node && node.getElementsByTagName(tag)[0];
            return child ? String(child.textContent || '').trim() : '';
          }

          function nodes(node, tag) {
            return Array.from(node ? node.getElementsByTagName(tag) : []);
          }

          function isHttpUrl(value) {
            return /^https?:\\/\\//i.test(String(value || '').trim());
          }

          function fireUrl(url, errorCode) {
            const raw = String(url || '').trim();
            if (!isHttpUrl(raw)) return;
            const finalUrl = raw
              .replace(/\\[CACHEBUSTER\\]/gi, String(Date.now()))
              .replace(/\\[ERRORCODE\\]/gi, String(errorCode || 900));
            try {
              const img = new Image();
              img.referrerPolicy = 'no-referrer-when-downgrade';
              img.src = finalUrl;
            } catch (_) {}
          }

          function fireUrls(urls, key, errorCode) {
            if (key && fired[key]) return;
            if (key) fired[key] = true;
            (urls || []).forEach(url => fireUrl(url, errorCode));
          }

          function mergeTrackers(base, extra) {
            const merged = Object.assign({}, base || {});
            Object.keys(extra || {}).forEach(eventName => {
              merged[eventName] = (merged[eventName] || []).concat(extra[eventName] || []);
            });
            return merged;
          }

          function extractTrackers(scope) {
            const result = {};
            nodes(scope, 'Tracking').forEach(item => {
              const eventName = item.getAttribute('event');
              const url = String(item.textContent || '').trim();
              if (!eventName || !url) return;
              result[eventName] = result[eventName] || [];
              result[eventName].push(url);
            });
            return result;
          }

          async function fetchVastText(source) {
            const input = String(source || '').trim();
            if (!input) throw new Error('مصدر VAST فارغ.');
            if (/^<\\s*VAST\\b/i.test(input)) return input;
            if (!isHttpUrl(input)) throw new Error('مصدر VAST يجب أن يكون رابط HTTPS أو XML كامل.');

            if (VAST_PROXY_URL) {
              try {
                const directResponse = await fetch(input, {
                  method: 'GET',
                  mode: 'cors',
                  credentials: 'omit',
                  cache: 'no-store'
                });
                if (directResponse.ok) return directResponse.text();
              } catch (_) {}
            }

            const response = await fetch(VAST_PROXY_URL ? VAST_PROXY_URL + '?url=' + encodeURIComponent(input) : input, {
              method: 'GET',
              mode: 'cors',
              credentials: 'omit',
              cache: 'no-store'
            });
            if (!response.ok) throw new Error('استجابة VAST غير صالحة: ' + response.status);
            return response.text();
          }

          function parseDuration(value) {
            const parts = String(value || '').trim().split(':').map(Number);
            if (parts.length !== 3 || parts.some(Number.isNaN)) return 0;
            return Math.round(parts[0] * 3600 + parts[1] * 60 + parts[2]);
          }

          function pickMediaFile(linear) {
            const supported = nodes(linear, 'MediaFile')
              .map(item => ({
                url: String(item.textContent || '').trim(),
                type: String(item.getAttribute('type') || '').toLowerCase(),
                bitrate: Number(item.getAttribute('bitrate') || 0)
              }))
              .filter(item => isHttpUrl(item.url) && item.type.indexOf('video/') === 0);

            supported.sort((a, b) => {
              const score = item => {
                if (item.type.includes('mp4')) return 4;
                if (item.type.includes('webm')) return 3;
                if (item.type.includes('ogg')) return 2;
                return 1;
              };
              return score(b) - score(a) || b.bitrate - a.bitrate;
            });
            return supported[0] || null;
          }

          async function resolveVast(source, depth, inherited) {
            if (depth > 4) throw new Error('تم تجاوز عدد Wrapper المسموح في VAST.');

            const xmlText = await fetchVastText(source);
            const doc = new DOMParser().parseFromString(xmlText, 'application/xml');
            if (doc.getElementsByTagName('parsererror').length) {
              throw new Error('ملف VAST XML غير صالح.');
            }

            const ads = nodes(doc, 'Ad');
            const adNode = ads.find(item => item.getElementsByTagName('InLine').length || item.getElementsByTagName('Wrapper').length);
            if (!adNode) throw new Error('لا يوجد Ad صالح داخل VAST.');

            const inheritedImpressions = (inherited && inherited.impressions) || [];
            const inheritedErrors = (inherited && inherited.errors) || [];
            const inheritedTrackers = (inherited && inherited.trackers) || {};

            const wrapper = adNode.getElementsByTagName('Wrapper')[0];
            const localImpressions = inheritedImpressions.concat(nodes(adNode, 'Impression').map(item => String(item.textContent || '').trim()));
            const localErrors = inheritedErrors.concat(nodes(adNode, 'Error').map(item => String(item.textContent || '').trim()));
            const localTrackers = mergeTrackers(inheritedTrackers, extractTrackers(adNode));

            if (wrapper) {
              const nextUrl = text(wrapper, 'VASTAdTagURI');
              if (!nextUrl) throw new Error('Wrapper VAST لا يحتوي على VASTAdTagURI.');
              return resolveVast(nextUrl, depth + 1, {
                impressions: localImpressions,
                errors: localErrors,
                trackers: localTrackers
              });
            }

            const linear = adNode.getElementsByTagName('Linear')[0];
            if (!linear) throw new Error('لا يوجد Linear Creative لتشغيل الفيديو.');

            const media = pickMediaFile(linear);
            if (!media) throw new Error('لا يوجد ملف فيديو مدعوم داخل VAST.');

            return {
              title: text(adNode, 'AdTitle') || AD_TITLE,
              mediaUrl: media.url,
              mediaType: media.type,
              duration: parseDuration(text(linear, 'Duration')),
              clickThrough: text(linear, 'ClickThrough'),
              impressions: localImpressions,
              errors: localErrors,
              trackers: mergeTrackers(localTrackers, extractTrackers(linear))
            };
          }

          async function boot() {
            try {
              showStatus('جاري قراءة VAST XML...', 'يتم استخراج ملف الفيديو وروابط التتبع.');
              const vast = await resolveVast(VAST_SOURCE, 0, { impressions: [], errors: [], trackers: {} });
              videoEl.src = vast.mediaUrl;
              if (vast.mediaType) videoEl.type = vast.mediaType;

              if (isHttpUrl(vast.clickThrough)) {
                clickEl.href = vast.clickThrough;
                clickEl.style.display = 'inline-block';
              }

              videoEl.addEventListener('loadeddata', () => {
                stateEl.style.display = 'none';
                videoEl.style.display = 'block';
                fireUrls(vast.impressions, 'impressions');
              });

              videoEl.addEventListener('play', () => fireUrls(vast.trackers.start, 'start'));
              videoEl.addEventListener('ended', () => fireUrls(vast.trackers.complete, 'complete'));
              videoEl.addEventListener('error', () => {
                fireUrls(vast.errors, 'video-error', 405);
                reportCrash('تعذر تحميل ملف الفيديو داخل VAST.');
              });

              videoEl.addEventListener('timeupdate', () => {
                const duration = videoEl.duration || vast.duration || 0;
                if (!duration) return;
                const progress = videoEl.currentTime / duration;
                if (progress >= 0.25) fireUrls(vast.trackers.firstQuartile, 'firstQuartile');
                if (progress >= 0.50) fireUrls(vast.trackers.midpoint, 'midpoint');
                if (progress >= 0.75) fireUrls(vast.trackers.thirdQuartile, 'thirdQuartile');
              });

              showStatus('تم تحميل إعلان الفيديو', 'سيبدأ التشغيل تلقائياً، ويمكنك تشغيله يدوياً إذا منع المتصفح التشغيل.');
              try {
                await videoEl.play();
              } catch (_) {
                videoEl.style.display = 'block';
                stateEl.style.display = 'none';
              }
            } catch (error) {
              const message = error && error.message ? error.message : String(error);
              if (/Failed to fetch|NetworkError|CORS/i.test(message)) {
                reportCrash('مزود VAST لا يسمح بقراءة XML من المتصفح مباشرة. استخدم XML كامل أو Proxy يدعم CORS.');
              } else {
                reportCrash(message);
              }
            }
          }

          boot();
        </script>
      </body>
      </html>
    `;
  },

  // حقن الإعلان بشكل آمن داخل iframe معزول (Sandbox)
  renderAd(ad, container) {
    if (window.AdNormalizer) {
      ad = window.AdNormalizer.normalizeAd(ad);
    }

    this.currentAd = ad;
    this.expectedDuration = ad.duration || 15;
    this.clearContainer(container);
    
    if (!container) return;

    // إظهار الهيكل العظمي للتحميل (Skeleton Loader)
    const skeleton = document.getElementById('ad-skeleton');
    if (skeleton) skeleton.style.display = 'flex';

    // إنشاء الـ Sandbox Iframe
    const iframe = document.createElement('iframe');
    iframe.id = 'ad-sandbox-frame';
    iframe.className = 'ad-sandbox-frame';
    
    // سياسة العزل الصارمة:
    // allow-scripts: لتشغيل جافا سكريبت الإعلانات
    // allow-popups & allow-forms: للسماح بفتح روابط الإعلانات أو النماذج بشكل آمن
    // لا نضع allow-same-origin لمنع الإعلان من الوصول لـ localStorage و cookies الخاص بالموقع الأساسي
    iframe.setAttribute('sandbox', 'allow-scripts allow-popups allow-forms');
    iframe.style.width = '100%';
    iframe.style.height = '100%';
    iframe.style.border = 'none';
    iframe.style.opacity = '0'; // نخفيه حتى يكتمل التحميل
    iframe.style.transition = 'opacity 0.3s ease';

    // بدء حماية التحميل (Timeout Watchdog) - 12 ثانية
    clearTimeout(this.watchdogTimeout);
    this.watchdogTimeout = setTimeout(() => {
      if (iframe.style.opacity === '0' && this.isPlaying) {
        window.FirestoreService?.reportSecurityIncident?.('ad-load-timeout', { adId: ad.id });
        this.handleCrash('فشل تحميل الإعلان خلال المهلة المحددة (Timeout)');
      }
    }, 12000);

    // عند اكتمال التحميل
    iframe.onload = () => {
      clearTimeout(this.watchdogTimeout);
      if (skeleton) skeleton.style.display = 'none';
      iframe.style.opacity = '1';
      
      // تسجيل ظهور الإعلان في التحليلات لمنع احتساب مرات الظهور لإعلانات المعاينة
      if (ad.id !== 'preview-ad-id') {
        window.StorageDB.incrementAdMetric(ad.id, 'impressions');
      }
    };

    // كتابة محتوى الإعلان حسب نوعه
    if (ad.type === 'iframe') {
      iframe.src = ad.code;
      container.appendChild(iframe);
    } 
    else if (ad.type === 'vast') {
      iframe.setAttribute('sandbox', 'allow-scripts allow-popups allow-forms allow-same-origin');
      container.appendChild(iframe);
      iframe.srcdoc = this.buildVastPlayerDoc(ad);
    }
    else if (ad.type === 'html') {
      const docHtml = `
        <!DOCTYPE html>
        <html lang="ar" dir="rtl">
        <head>
          <meta charset="UTF-8">
          <style>
            body { 
              margin: 0; 
              padding: 16px; 
              background: transparent; 
              color: #fffffe; 
              font-family: 'Cairo', sans-serif; 
              text-align: center;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              min-height: calc(100vh - 32px);
            }
          </style>
        </head>
        <body>
          ${ad.code}
        </body>
        </html>
      `;
      container.appendChild(iframe);
      iframe.srcdoc = docHtml;
    } 
    else if (ad.type === 'script') {
      const docScript = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <style>
            body { 
              margin: 0; 
              padding: 16px; 
              background: transparent; 
              color: #fffffe; 
              font-family: sans-serif; 
              text-align: center; 
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              min-height: calc(100vh - 32px);
            }
          </style>
        </head>
        <body>
          <div id="script-ad-container"></div>
          <script>
            window.onerror = function(message, source, lineno, colno, error) {
              window.parent.postMessage({ type: 'ad_crash', error: message, adId: '${ad.id}' }, '*');
              return true;
            };
            try {
              ${ad.code}
            } catch(e) {
              window.parent.postMessage({ type: 'ad_crash', error: e.message, adId: '${ad.id}' }, '*');
            }
          </script>
        </body>
        </html>
      `;
      container.appendChild(iframe);
      iframe.srcdoc = docScript;
    } 
    else if (ad.type === 'adsense') {
      // إعلانات جوجل أدسنس تتطلب أحياناً الحقن في بيئة محلية، سنقوم بحقنها مع توفير إمكانية العرض البديل
      const docAdsense = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
        </head>
        <body style="margin:0; padding:0; display:flex; justify-content:center; align-items:center; min-height:100vh; background:transparent;">
          ${ad.code}
        </body>
        </html>
      `;
      container.appendChild(iframe);
      iframe.srcdoc = docAdsense;
    }
  },

  // معالجة كراش الإعلانات وحماية الواجهة الأساسية
  handleCrash(errorMsg) {
    if (!this.isPlaying) return;
    this.isPlaying = false;
    
    // إزالة رمز جلسة الأمان فوراً لإحباط أي محاولات تلاعب بالرصيد
    if (window.Security) {
      window.Security.endRewardSession('ad-crash');
    } else {
      sessionStorage.removeItem('ap_ad_session');
    }

    // إيقاف العدادات والمؤقتات في واجهة التحكم الأساسية لمنع التسريبات والاحتساب التلقائي
    if (window.AdsController) {
      window.AdsController.isPlaying = false;
      window.AdsController.isCooldown = false;
      window.AdsController.cleanupTimers();
    }
    
    clearInterval(this.timerInterval);
    clearTimeout(this.watchdogTimeout);

    const activeAdId = this.currentAd ? this.currentAd.id : null;
    if (activeAdId) {
      // تسجيل العطل وتأشير الإعلان بأنه معطل وتخزينه كـ broken
      window.FirestoreService?.reportSecurityIncident?.('ad-render-crash', {
        adId: activeAdId,
        errorMsg
      });
      window.StorageDB.incrementAdMetric(activeAdId, 'skippedViews', 1);
    }

    // تنظيف الحاوية وعرض شاشة الخطأ للمستخدم
    const container = document.getElementById('ad-sandbox-viewport');
    this.clearContainer(container);

    const errorDisplay = document.getElementById('ad-error-display');
    if (errorDisplay) {
      errorDisplay.style.display = 'flex';
      const errorText = errorDisplay.querySelector('.error-text');
      if (errorText) {
        errorText.textContent = `عذراً! واجه الإعلان مشكلة تقنية وتم إيقافه لمنع تجميد الصفحة. (${errorMsg})`;
      }
    }

    window.App.showToast('تم إيقاف إعلان معطوب وتجاوزه تلقائياً للحفاظ على استقرار النظام.', 'error');

    // إعداد أزرار التحكم
    const startBtn = document.getElementById('start-ad-btn');
    const nextBtn = document.getElementById('next-ad-btn');
    const statusMsgEl = document.getElementById('ad-status-msg');

    if (startBtn) startBtn.style.display = 'none';
    
    // الانتقال التلقائي بعد 3 ثوانٍ
    if (nextBtn) {
      nextBtn.style.display = 'inline-flex';
      nextBtn.disabled = true;
      let counter = 3;
      nextBtn.innerHTML = `تخطي تلقائي خلال (${counter})`;
      
      const autoSkipInterval = setInterval(() => {
        counter--;
        nextBtn.innerHTML = `تخطي تلقائي خلال (${counter})`;
        if (counter <= 0) {
          clearInterval(autoSkipInterval);
          nextBtn.disabled = false;
          nextBtn.innerHTML = 'الإعلان التالي ←';
          // تحديث الواجهة والتحميل التلقائي للإعلان التالي
          if (window.AdsController) {
            window.AdsController.nextAd();
          }
        }
      }, 1000);
    }
  },

  // توليد هاش أمان للتحقق من نزاهة المشاهدة والمكافأة
  generateAdSessionToken(ad) {
    if (window.Security) {
      return window.Security.createRewardSession(ad, this.expectedDuration);
    }

    const userId = window.Auth.getCurrentUser()?.id || 'anon';
    const timestamp = Date.now();
    const sessionToken = {
      adId: ad.id,
      userId: userId,
      startTime: timestamp,
      expectedDuration: this.expectedDuration,
      salt: Math.random().toString(36).substring(2, 12)
    };
    
    // تشفير محلي بسيط للبيانات لمنع العبث اليدوي السهل بـ sessionStorage
    const encoded = btoa(JSON.stringify(sessionToken));
    sessionStorage.setItem('ap_ad_session', encoded);
  },

  // التحقق من صحة جلسة الإعلانات وتخطي محاولات التلاعب بالوقت
  verifyAdSession(adId) {
    if (window.Security) {
      const elapsed = window.AdsController ? window.AdsController.secondsElapsed : this.expectedDuration;
      return window.Security.verifyRewardSession(adId, elapsed);
    }

    const encoded = sessionStorage.getItem('ap_ad_session');
    if (!encoded) return { valid: false, reason: 'لم يتم العثور على جلسة إعلانات صالحة.' };

    try {
      const session = JSON.parse(atob(encoded));
      const now = Date.now();
      
      if (session.adId !== adId) {
        return { valid: false, reason: 'معرف الإعلان في الجلسة غير متطابق.' };
      }

      const userId = window.Auth.getCurrentUser()?.id || 'anon';
      if (session.userId !== userId) {
        return { valid: false, reason: 'صاحب الجلسة غير متطابق مع الحساب المسجل.' };
      }

      const elapsedSeconds = (now - session.startTime) / 1000;
      const requiredDuration = session.expectedDuration - 0.25; // سماح بـ 250ms كفرق تزامن طبيعي

      if (elapsedSeconds < requiredDuration) {
        return { valid: false, reason: `فشل التحقق من الوقت: استغرق العرض ${elapsedSeconds.toFixed(1)}ث بينما المطلوب ${session.expectedDuration}ث.` };
      }

      // الجلسة صالحة
      return { valid: true };
    } catch (e) {
      return { valid: false, reason: 'خطأ في معالجة بيانات الجلسة.' };
    } finally {
      // إزالة الجلسة فوراً لمنع تكرار الاحتساب المزدوج أو Replay Attacks
      sessionStorage.removeItem('ap_ad_session');
    }
  },

  // إلغاء الجلسة الحالية وإيقاف المشاهدة نظراً لتعديل أو حذف الإعلان
  abortActiveAd(reason) {
    if (!this.isPlaying) return;
    this.isPlaying = false;
    
    if (window.Security) {
      window.Security.endRewardSession('active-ad-aborted');
    } else {
      sessionStorage.removeItem('ap_ad_session');
    }

    if (window.AdsController) {
      window.AdsController.isPlaying = false;
      window.AdsController.isCooldown = false;
      window.AdsController.cleanupTimers();
    }
    
    clearInterval(this.timerInterval);
    clearTimeout(this.watchdogTimeout);

    const container = document.getElementById('ad-sandbox-viewport');
    this.clearContainer(container);

    const errorDisplay = document.getElementById('ad-error-display');
    if (errorDisplay) {
      errorDisplay.style.display = 'flex';
      const errorText = errorDisplay.querySelector('.error-text');
      if (errorText) {
        errorText.textContent = reason;
      }
    }

    window.App.showToast(reason, 'warning');

    const startBtn = document.getElementById('start-ad-btn');
    const nextBtn = document.getElementById('next-ad-btn');

    if (startBtn) startBtn.style.display = 'none';
    if (nextBtn) {
      nextBtn.style.display = 'inline-flex';
      nextBtn.disabled = false;
      nextBtn.innerHTML = 'الإعلان التالي ←';
      nextBtn.onclick = () => {
        if (window.AdsController) {
          window.AdsController.nextAd();
        }
      };
    }
  },

  // مزامنة حالة شاشة مشاهدة الإعلانات وتحديثها تلقائياً عند تغيير مخزون الإعلانات
  refreshCurrentAd() {
    if (typeof window.AdsController !== 'undefined' && window.AdsController) {
      const controller = window.AdsController;
      
      // إذا كان هناك إعلان محمل حالياً
      if (controller.currentAd) {
        const currentAdId = controller.currentAd.id;
        const latestAd = window.StorageDB.getAdById(currentAdId);
        
        if (controller.isPlaying) {
          // إذا كان المستخدم يشاهد الإعلان حالياً
          if (!latestAd || !latestAd.active || latestAd.status === 'error' || latestAd.isBroken) {
            this.abortActiveAd('تم تعطيل أو حذف هذا الإعلان من قبل الإدارة أثناء مشاهدتك له.');
          } else if (
            latestAd.duration !== controller.currentAd.duration ||
            latestAd.reward !== controller.currentAd.reward ||
            latestAd.type !== controller.currentAd.type ||
            latestAd.code !== controller.currentAd.code
          ) {
            this.abortActiveAd('تم تعديل محتوى الإعلان من قبل الإدارة أثناء مشاهدتك له.');
          }
        } else {
          // إذا كان المستخدم في وضع الاستعداد ولم يبدأ المشاهدة بعد
          if (!latestAd || !latestAd.active || latestAd.status === 'error' || latestAd.isBroken) {
            controller.loadAd();
          } else if (
            latestAd.duration !== controller.currentAd.duration ||
            latestAd.reward !== controller.currentAd.reward ||
            latestAd.type !== controller.currentAd.type ||
            latestAd.code !== controller.currentAd.code ||
            latestAd.title !== controller.currentAd.title ||
            latestAd.description !== controller.currentAd.description
          ) {
            controller.loadAd();
          }
        }
      } else {
        // لا يوجد إعلان نشط معروض حالياً (مثلاً كان الطابور فارغاً)
        controller.loadAd();
      }
    }
  }
};

// تهيئة محرك الإعلانات مباشرة
AdEngine.init();
window.AdEngine = AdEngine;
