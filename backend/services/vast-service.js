'use strict';

const { appError } = require('../utils/app-error');
const { splitCsv, hostMatches, looksPrivateHost } = require('../utils/validators');
const { TtlCache } = require('../utils/cache');
const { securityIncident, writeLog } = require('./log-service');
const { getSettings } = require('./settings-service');

const DEFAULT_HOSTS = [
  'second-director.com',
  '*.second-director.com',
  'silent-basis.pro',
  '*.silent-basis.pro',
  'hilltopads.com',
  '*.hilltopads.com',
  'monetag.com',
  '*.monetag.com',
  'adsterra.com',
  '*.adsterra.com',
  'adsterra.org',
  '*.adsterra.org',
  'highperformanceformat.com',
  '*.highperformanceformat.com'
];

const ttlMs = Number(process.env.VAST_CACHE_TTL_SECONDS || 300) * 1000;
const maxBytes = Number(process.env.VAST_MAX_BYTES || 1024 * 1024);
const timeoutMs = Number(process.env.VAST_TIMEOUT_MS || 5000);
const cache = new TtlCache(ttlMs, 200);

async function allowedHosts() {
  const settings = await getSettings().catch(() => ({}));
  const fromEnv = splitCsv(process.env.VAST_ALLOWED_HOSTS);
  const fromSettings = Array.isArray(settings.allowedVastHosts) ? settings.allowedVastHosts : [];
  return [...new Set([...DEFAULT_HOSTS, ...fromEnv, ...fromSettings].filter(Boolean))];
}

async function fetchWithTimeout(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        Accept: 'application/xml,text/xml,text/plain,*/*;q=0.8',
        'User-Agent': 'AdPlatformRenderVastProxy/1.0'
      }
    });
  } finally {
    clearTimeout(timer);
  }
}

async function readLimitedText(response) {
  const reader = response.body && response.body.getReader ? response.body.getReader() : null;
  if (!reader) {
    const text = await response.text();
    if (Buffer.byteLength(text, 'utf8') > maxBytes) throw appError(413, 'vast_too_large', 'VAST XML is too large.');
    return text;
  }

  const chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > maxBytes) throw appError(413, 'vast_too_large', 'VAST XML is too large.');
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function proxyVast(rawUrl) {
  let target;
  try {
    target = new URL(String(rawUrl || '').trim());
  } catch (_) {
    throw appError(400, 'invalid_vast_url', 'Invalid VAST URL.');
  }

  if (target.protocol !== 'https:') throw appError(400, 'non_https_vast', 'Only HTTPS VAST URLs are allowed.');
  if (looksPrivateHost(target.hostname)) throw appError(403, 'private_vast_host', 'Private/internal hosts are blocked.');

  const hosts = await allowedHosts();
  if (!hosts.some(pattern => hostMatches(target.hostname, pattern))) {
    await securityIncident('vast_proxy_host_blocked', { url: target.toString(), hostname: target.hostname }, 'medium');
    throw appError(403, 'vast_host_blocked', 'VAST host is not allowed.');
  }

  const cacheKey = target.toString();
  const cached = cache.get(cacheKey);
  if (cached) return { xml: cached, cached: true };

  let lastError = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetchWithTimeout(target.toString());
      if (!response.ok) throw appError(502, 'vast_upstream_error', `VAST upstream returned ${response.status}.`);
      const contentType = String(response.headers.get('content-type') || '').toLowerCase();
      const xml = await readLimitedText(response);
      if (!/<\s*VAST\b/i.test(xml)) throw appError(502, 'invalid_vast_xml', 'Response does not contain VAST XML.');
      if (contentType && !/(xml|text|octet-stream)/i.test(contentType)) {
        await securityIncident('vast_content_type_warning', { url: target.toString(), contentType }, 'low');
      }
      cache.set(cacheKey, xml);
      await writeLog('vast_proxy_success', { url: target.toString(), cached: false }, 'info');
      return { xml, cached: false };
    } catch (error) {
      lastError = error;
    }
  }

  await securityIncident('vast_proxy_fetch_failed', {
    url: target.toString(),
    message: lastError && lastError.message,
    code: lastError && lastError.code
  }, 'medium');
  throw lastError || appError(502, 'vast_fetch_failed', 'VAST fetch failed.');
}

module.exports = {
  proxyVast,
  allowedHosts
};
