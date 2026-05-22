/* ============================================================
   ad-normalizer.js - normalizes admin ad input before preview/save/render
   ============================================================ */

'use strict';

(function initAdNormalizer(window) {
  const SCRIPT_TAG_RE = /<script\b([^>]*)>([\s\S]*?)<\/script>/i;
  const SCRIPT_SRC_RE = /\bsrc\s*=\s*["']([^"']+)["']/i;

  function toStringValue(value) {
    return String(value || '').trim();
  }

  function toAbsoluteUrl(value) {
    const raw = toStringValue(value);
    if (!raw) return null;
    try {
      const normalized = raw.startsWith('//') ? `https:${raw}` : raw;
      const url = new URL(normalized);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
      return url;
    } catch (_) {
      return null;
    }
  }

  function escapeJsString(value) {
    return String(value)
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "\\'")
      .replace(/\r/g, '\\r')
      .replace(/\n/g, '\\n')
      .replace(/</g, '\\x3c');
  }

  function getScriptSrc(code) {
    const match = toStringValue(code).match(SCRIPT_TAG_RE);
    if (!match) return null;
    const src = match[1].match(SCRIPT_SRC_RE);
    return src ? src[1] : null;
  }

  function getInlineScriptBody(code) {
    const match = toStringValue(code).match(SCRIPT_TAG_RE);
    if (!match || getScriptSrc(code)) return null;
    return toStringValue(match[2]);
  }

  function hasMarkup(code) {
    return /<[a-z][\s\S]*>/i.test(toStringValue(code));
  }

  function isVastXml(code) {
    return /<\s*VAST\b/i.test(toStringValue(code));
  }

  function isProbablyVastUrl(url) {
    const path = url.pathname.toLowerCase();
    const search = url.search.toLowerCase();
    const full = `${path}${search}`;

    return /\.xml$/i.test(path)
      || full.includes('vast')
      || full.includes('vmap')
      || url.searchParams.has('vast')
      || url.searchParams.has('vmap');
  }

  function isProbablyEmbedPage(url) {
    const host = url.hostname.toLowerCase();
    const path = url.pathname.toLowerCase();

    if (path === '/' || path === '') return true;
    if (/\.(html?|php|aspx?)$/i.test(path)) return true;
    if (path.includes('/embed') || path.includes('/iframe') || path.includes('/widget')) return true;
    if (url.searchParams.has('embed') || url.searchParams.has('iframe')) return true;
    if (host.includes('youtube.com') || host === 'youtu.be' || host.includes('vimeo.com')) return true;
    if (host.includes('google.com') && path.includes('/maps')) return true;

    return false;
  }

  function isProbablyAdScriptUrl(url) {
    const host = url.hostname.toLowerCase();
    const path = url.pathname.toLowerCase();
    const full = `${host}${path}${url.search}`.toLowerCase();
    const fileName = path.split('/').filter(Boolean).pop() || '';

    if (/\.(js|mjs)$/i.test(path)) return true;
    if (/^[a-z]\.[a-z0-9_-]{8,}/i.test(fileName)) return true;
    if (/(ad|ads|tag|zone|banner|pop|direct|director|traffic|click|serve|invoke|push)/i.test(full)) return true;
    if (!isProbablyEmbedPage(url) && `${path}${url.search}`.length > 35) return true;

    return false;
  }

  function buildExternalScriptHtml(url, label) {
    const safeUrl = escapeJsString(url.href);
    const safeLabel = String(label || 'external-ad').replace(/[^a-z0-9_-]/gi, '').slice(0, 40) || 'external-ad';

    return `<div id="${safeLabel}-slot" style="min-height:180px;display:flex;align-items:center;justify-content:center;color:#a7a9be;font-family:sans-serif;">جاري تحميل الإعلان...</div>
<script>
(function(){
  var script = document.createElement('script');
  script.src = '${safeUrl}';
  script.async = true;
  script.referrerPolicy = 'no-referrer-when-downgrade';
  script.onerror = function(){
    var slot = document.getElementById('${safeLabel}-slot');
    if (slot) slot.textContent = 'تعذر تحميل الإعلان الخارجي مؤقتا.';
  };
  document.body.appendChild(script);
})();
</script>`;
  }

  function normalizeForStorage(type, code) {
    const requestedType = toStringValue(type) || 'html';
    const requestedCode = toStringValue(code);

    if (requestedType === 'vast' || isVastXml(requestedCode)) {
      const vastUrl = toAbsoluteUrl(requestedCode);
      return {
        type: 'vast',
        code: vastUrl ? vastUrl.href : requestedCode,
        changed: requestedType !== 'vast' || (vastUrl && vastUrl.href !== requestedCode),
        reason: isVastXml(requestedCode) ? 'vast-xml' : 'vast-url'
      };
    }

    const scriptSrc = getScriptSrc(requestedCode);
    const scriptUrl = toAbsoluteUrl(scriptSrc);
    if (scriptUrl) {
      return {
        type: 'html',
        code: buildExternalScriptHtml(scriptUrl, 'external-script-ad'),
        changed: requestedType !== 'html' || requestedCode !== buildExternalScriptHtml(scriptUrl, 'external-script-ad'),
        reason: 'script-tag-src'
      };
    }

    const inlineScript = requestedType === 'script' ? getInlineScriptBody(requestedCode) : null;
    if (inlineScript) {
      return {
        type: 'script',
        code: inlineScript,
        changed: true,
        reason: 'inline-script-tag'
      };
    }

    const directUrl = toAbsoluteUrl(requestedCode);
    if (directUrl) {
      if (isProbablyVastUrl(directUrl)) {
        return {
          type: 'vast',
          code: directUrl.href,
          changed: requestedType !== 'vast' || directUrl.href !== requestedCode,
          reason: 'vast-url-detected'
        };
      }

      if (requestedType === 'iframe' && isProbablyEmbedPage(directUrl) && !isProbablyAdScriptUrl(directUrl)) {
        return {
          type: 'iframe',
          code: directUrl.href,
          changed: directUrl.href !== requestedCode,
          reason: 'embeddable-iframe-url'
        };
      }

      return {
        type: 'html',
        code: buildExternalScriptHtml(directUrl, 'external-url-ad'),
        changed: true,
        reason: 'external-script-url'
      };
    }

    if (requestedType === 'iframe' && hasMarkup(requestedCode)) {
      return {
        type: 'html',
        code: requestedCode,
        changed: true,
        reason: 'iframe-markup-to-html'
      };
    }

    return {
      type: requestedType,
      code: requestedCode,
      changed: false,
      reason: 'unchanged'
    };
  }

  function normalizeAd(ad) {
    if (!ad) return ad;
    const normalized = normalizeForStorage(ad.type, ad.code);
    return {
      ...ad,
      type: normalized.type,
      code: normalized.code,
      normalizedReason: normalized.reason
    };
  }

  window.AdNormalizer = {
    normalizeForStorage,
    normalizeAd,
    isProbablyAdScriptUrl,
    isProbablyVastUrl,
    isVastXml
  };
})(window);
