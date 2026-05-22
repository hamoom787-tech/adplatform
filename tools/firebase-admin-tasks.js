'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const PROJECT_ID = 'adplatform-4d5a0';
const PROJECT_NUMBER = '47580119880';
const API_KEY = 'AIzaSyClqe7K3eRiL5g46UFcQqms5e1Hzc69wNk';
const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL || 'admin@platform.com';

function loadFirebaseCliAuth() {
  try {
    return require('firebase-tools/lib/auth');
  } catch (_) {
    return require('C:/tmp/firebase-tools-probe/node_modules/firebase-tools/lib/auth');
  }
}

async function getAccessToken() {
  const auth = loadFirebaseCliAuth();
  const account = auth.getGlobalDefaultAccount();
  if (!account || !account.tokens || !account.tokens.refresh_token) {
    throw new Error('Firebase CLI is not logged in.');
  }
  const scopes = String(account.tokens.scope || '').split(/\s+/).filter(Boolean);
  const token = await auth.getAccessToken(account.tokens.refresh_token, scopes);
  return token.access_token;
}

async function authedFetch(url, options = {}) {
  const accessToken = await getAccessToken();
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch (_) {
    body = text;
  }
  return { ok: response.ok, status: response.status, body };
}

async function publicFirebaseFetch(pathname, body) {
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/${pathname}?key=${API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const text = await response.text();
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch (_) {
    parsed = text;
  }
  return { ok: response.ok, status: response.status, body: parsed };
}

async function enableAuth() {
  const enable = await authedFetch(
    `https://serviceusage.googleapis.com/v1/projects/${PROJECT_NUMBER}/services/identitytoolkit.googleapis.com:enable`,
    { method: 'POST', body: '{}' }
  );
  if (![200, 409].includes(enable.status) && !enable.ok) {
    throw new Error(`Failed to enable identitytoolkit API: ${JSON.stringify(enable.body)}`);
  }

  await new Promise(resolve => setTimeout(resolve, 8000));

  const initialize = await authedFetch(
    `https://identitytoolkit.googleapis.com/v2/projects/${PROJECT_ID}/identityPlatform:initializeAuth`,
    { method: 'POST', body: '{}' }
  );
  if (![200, 409].includes(initialize.status) && !initialize.ok) {
    throw new Error(`Failed to initialize Firebase Auth: ${JSON.stringify(initialize.body)}`);
  }

  await new Promise(resolve => setTimeout(resolve, 5000));

  const patch = await authedFetch(
    `https://identitytoolkit.googleapis.com/admin/v2/projects/${PROJECT_ID}/config?updateMask=signIn.email.enabled,signIn.email.passwordRequired`,
    {
      method: 'PATCH',
      body: JSON.stringify({
        signIn: {
          email: {
            enabled: true,
            passwordRequired: true
          }
        }
      })
    }
  );

  if (!patch.ok) {
    throw new Error(`Failed to enable Email/Password Auth: ${JSON.stringify(patch.body)}`);
  }

  return true;
}

function makePassword() {
  return `Adm-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}!`;
}

async function createAdminAuthUser() {
  const password = makePassword();
  const signup = await publicFirebaseFetch('accounts:signUp', {
    email: ADMIN_EMAIL,
    password,
    returnSecureToken: true
  });

  if (!signup.ok) {
    const message = signup.body && signup.body.error && signup.body.error.message;
    if (message === 'EMAIL_EXISTS') {
      return { email: ADMIN_EMAIL, password: null, uid: null, existed: true };
    }
    throw new Error(`Failed to create admin auth user: ${JSON.stringify(signup.body)}`);
  }

  return {
    email: ADMIN_EMAIL,
    password,
    uid: signup.body.localId,
    existed: false
  };
}

function firestoreValue(value) {
  if (value === null || value === undefined) return { nullValue: null };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(firestoreValue) } };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') {
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  if (typeof value === 'object') {
    const fields = {};
    Object.entries(value).forEach(([key, item]) => {
      fields[key] = firestoreValue(item);
    });
    return { mapValue: { fields } };
  }
  return { stringValue: String(value) };
}

async function writeDoc(collection, id, data) {
  const fields = {};
  Object.entries(data).forEach(([key, value]) => {
    fields[key] = firestoreValue(value);
  });
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/${collection}/${encodeURIComponent(id)}`;
  const response = await authedFetch(url, {
    method: 'PATCH',
    body: JSON.stringify({ fields })
  });
  if (!response.ok) {
    throw new Error(`Failed to write ${collection}/${id}: ${JSON.stringify(response.body)}`);
  }
}

async function readFirestoreDoc(collection, id) {
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/${collection}/${encodeURIComponent(id)}`;
  const response = await authedFetch(url, { method: 'GET' });
  return response;
}

async function listFirestoreCollection(collection) {
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/${collection}`;
  const response = await authedFetch(url, { method: 'GET' });
  return response;
}

async function deleteFirestoreDoc(collection, id) {
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/${collection}/${encodeURIComponent(id)}`;
  const response = await authedFetch(url, { method: 'DELETE' });
  if (!response.ok && response.status !== 404) {
    throw new Error(`Failed to delete ${collection}/${id}: ${JSON.stringify(response.body)}`);
  }
  return response.ok;
}

function firestoreFieldToValue(field) {
  if (!field) return undefined;
  if ('stringValue' in field) return field.stringValue;
  if ('integerValue' in field) return Number(field.integerValue);
  if ('doubleValue' in field) return Number(field.doubleValue);
  if ('booleanValue' in field) return Boolean(field.booleanValue);
  if ('nullValue' in field) return null;
  if ('arrayValue' in field) return (field.arrayValue.values || []).map(firestoreFieldToValue);
  if ('mapValue' in field) {
    return Object.fromEntries(
      Object.entries(field.mapValue.fields || {}).map(([key, value]) => [key, firestoreFieldToValue(value)])
    );
  }
  return undefined;
}

function firestoreDocumentToObject(doc) {
  return Object.fromEntries(
    Object.entries(doc.fields || {}).map(([key, value]) => [key, firestoreFieldToValue(value)])
  );
}

async function patchDocFields(collection, id, data) {
  const fields = {};
  Object.entries(data).forEach(([key, value]) => {
    fields[key] = firestoreValue(value);
  });
  const updateMask = Object.keys(data)
    .map(key => `updateMask.fieldPaths=${encodeURIComponent(key)}`)
    .join('&');
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/${collection}/${encodeURIComponent(id)}?${updateMask}`;
  const response = await authedFetch(url, {
    method: 'PATCH',
    body: JSON.stringify({ fields })
  });
  if (!response.ok) {
    throw new Error(`Failed to patch ${collection}/${id}: ${JSON.stringify(response.body)}`);
  }
}

async function setAuthCustomClaims(uid, claims) {
  const response = await authedFetch(
    `https://identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}/accounts:update`,
    {
      method: 'POST',
      body: JSON.stringify({
        localId: uid,
        customAttributes: JSON.stringify(claims || {})
      })
    }
  );
  if (!response.ok) {
    throw new Error(`Failed to set custom claims for ${uid}: ${JSON.stringify(response.body)}`);
  }
  return response.body;
}

async function findUserByEmail(email) {
  const users = await listFirestoreCollection('users');
  if (!users.ok || !users.body.documents) return null;
  const target = String(email || '').trim().toLowerCase();
  for (const doc of users.body.documents) {
    const id = doc.name.split('/').pop();
    const user = { id, ...firestoreDocumentToObject(doc) };
    if (String(user.email || '').trim().toLowerCase() === target) return user;
  }
  return null;
}

async function setAdminClaims() {
  const uid = process.env.ADMIN_UID || '';
  const user = uid ? { id: uid, email: ADMIN_EMAIL } : await findUserByEmail(ADMIN_EMAIL);
  if (!user || !user.id) {
    throw new Error(`Admin user not found. Set SEED_ADMIN_EMAIL or ADMIN_UID first. Current email: ${ADMIN_EMAIL}`);
  }
  await setAuthCustomClaims(user.id, { admin: true, moderator: true });
  await patchDocFields('users', user.id, {
    role: 'admin',
    claimsUpdatedAt: new Date().toISOString(),
    claimsUpdatedBy: 'tools/firebase-admin-tasks.js'
  });
  return user;
}

function computeAvailableBalanceFromEarnings(user) {
  const earnings = Array.isArray(user.earnings) ? user.earnings : [];
  if (!earnings.length) return null;
  const earned = earnings
    .map(item => Number(item && item.amount))
    .filter(amount => Number.isFinite(amount) && amount > 0)
    .reduce((sum, amount) => sum + amount, 0);
  const debits = earnings
    .map(item => Number(item && item.amount))
    .filter(amount => Number.isFinite(amount) && amount < 0)
    .reduce((sum, amount) => sum + Math.abs(amount), 0);
  return +Math.max(0, earned - debits).toFixed(2);
}

async function reconcileUserBalances() {
  const users = await listFirestoreCollection('users');
  if (!users.ok || !users.body.documents) return { checked: 0, updated: 0 };
  let checked = 0;
  let updated = 0;
  for (const doc of users.body.documents) {
    checked += 1;
    const id = doc.name.split('/').pop();
    const user = { id, ...firestoreDocumentToObject(doc) };
    const computedBalance = computeAvailableBalanceFromEarnings(user);
    if (computedBalance === null) continue;
    const currentBalance = Number(user.balance || 0);
    if (Math.abs(currentBalance - computedBalance) < 0.005) continue;
    await patchDocFields('users', id, {
      balance: computedBalance,
      balanceReconciledAt: new Date().toISOString()
    });
    updated += 1;
  }
  return { checked, updated };
}

function replaceCurrencyLabels(value) {
  if (Array.isArray(value)) return value.map(replaceCurrencyLabels);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, replaceCurrencyLabels(item)])
    );
  }
  if (typeof value !== 'string') return value;
  return value
    .replace(/النقاط/g, 'الأرباح')
    .replace(/نقاط/g, 'جنيه')
    .replace(/نقطة/g, 'جنيه');
}

async function migrateCurrencyLabels() {
  const users = await listFirestoreCollection('users');
  if (!users.ok || !users.body.documents) return { checked: 0, updated: 0 };
  let checked = 0;
  let updated = 0;
  for (const doc of users.body.documents) {
    checked += 1;
    const id = doc.name.split('/').pop();
    const user = { id, ...firestoreDocumentToObject(doc) };
    const patch = {};
    if (Array.isArray(user.timeline)) {
      const nextTimeline = replaceCurrencyLabels(user.timeline);
      if (JSON.stringify(nextTimeline) !== JSON.stringify(user.timeline)) {
        patch.timeline = nextTimeline;
      }
    }
    if (Array.isArray(user.earnings)) {
      const nextEarnings = replaceCurrencyLabels(user.earnings);
      if (JSON.stringify(nextEarnings) !== JSON.stringify(user.earnings)) {
        patch.earnings = nextEarnings;
      }
    }
    if (Object.keys(patch).length) {
      patch.currencyLabelsMigratedAt = new Date().toISOString();
      await patchDocFields('users', id, patch);
      updated += 1;
    }
  }
  return { checked, updated };
}

async function cleanupE2EAds() {
  const ads = await listFirestoreCollection('ads');
  if (!ads.ok || !ads.body.documents) return 0;
  let deleted = 0;
  for (const doc of ads.body.documents) {
    const id = doc.name.split('/').pop();
    const title = firestoreFieldToValue(doc.fields && doc.fields.title);
    if (String(title || '').startsWith('E2E Test Ad ')) {
      await deleteFirestoreDoc('ads', id);
      await deleteFirestoreDoc('adAnalytics', id);
      deleted += 1;
    }
  }
  return deleted;
}

const REQUESTED_EXTERNAL_ADS = [
  {
    id: 'ad-deliciouslip-20260522',
    title: 'إعلان DeliciousLip الخارجي',
    category: 'إعلان خارجي',
    duration: 20,
    reward: 0.50,
    active: true,
    type: 'html',
    code: `<script>
(function(cdkv){
var d = document,
    s = d.createElement('script'),
    l = d.scripts[d.scripts.length - 1];
s.settings = cdkv || {};
s.src = "\\/\\/deliciouslip.com\\/b.XWVgswdOGTlo0WYaWSci\\/TeDm\\/9Hu\\/ZuUjlsktPZTrcwwGNbjIc\\/wTNcT_MvtKNYzvAE2GNZzxAM1\\/NjwQ";
s.async = true;
s.referrerPolicy = 'no-referrer-when-downgrade';
l.parentNode.insertBefore(s, l);
})({})
</script>`,
    description: 'كود إعلان خارجي يعمل داخل iframe معزول.',
    status: 'active',
    isBroken: false
  },
  {
    id: 'ad-second-director-20260522',
    title: 'إعلان Second Director الخارجي',
    category: 'إعلان خارجي',
    duration: 20,
    reward: 0.50,
    active: true,
    type: 'html',
    code: `<div id="second-director-ad-slot" style="min-height:180px;display:flex;align-items:center;justify-content:center;color:#a7a9be;font-family:sans-serif;">جاري تحميل الإعلان...</div>
<script>
(function(){
  var script = document.createElement('script');
  script.src = 'https://second-director.com/d.mBFQzRdFGFNcvrZEGEUi/be/mR9-uLZ/UplTk/PyTgcYw/Nojqc_wPMmjsETt-N/zaAW2gNwzjAay/NPQN';
  script.async = true;
  script.referrerPolicy = 'no-referrer-when-downgrade';
  script.onerror = function(){
    var slot = document.getElementById('second-director-ad-slot');
    if (slot) slot.textContent = 'تعذر تحميل الإعلان الخارجي مؤقتا.';
  };
  document.body.appendChild(script);
})();
</script>`,
    description: 'كود إعلان خارجي يتم تحميله كسكريبت داخل iframe معزول.',
    status: 'active',
    isBroken: false
  }
];

async function addRequestedExternalAds() {
  const now = new Date().toISOString();
  let written = 0;
  let analyticsCreated = 0;

  for (const ad of REQUESTED_EXTERNAL_ADS) {
    const existing = await readFirestoreDoc('ads', ad.id);
    const current = existing.ok ? firestoreDocumentToObject(existing.body) : {};
    const nextAd = {
      ...current,
      ...ad,
      impressions: Number.isFinite(Number(current.impressions)) ? Number(current.impressions) : 0,
      completedViews: Number.isFinite(Number(current.completedViews)) ? Number(current.completedViews) : 0,
      skippedViews: Number.isFinite(Number(current.skippedViews)) ? Number(current.skippedViews) : 0,
      totalRewards: Number.isFinite(Number(current.totalRewards)) ? Number(current.totalRewards) : 0,
      createdAt: current.createdAt || now,
      updatedAt: now
    };

    await writeDoc('ads', ad.id, nextAd);
    written += 1;

    const analytics = await readFirestoreDoc('adAnalytics', ad.id);
    if (!analytics.ok) {
      await writeDoc('adAnalytics', ad.id, {
        id: ad.id,
        impressions: 0,
        completedViews: 0,
        skippedViews: 0,
        totalRewards: 0,
        totalWatchTime: 0,
        averageWatchTime: 0,
        lastShownAt: null
      });
      analyticsCreated += 1;
    }
  }

  return { written, analyticsCreated };
}

function loadDefaults() {
  const storageFile = path.join(process.cwd(), 'js', 'storage.js');
  const source = `${fs.readFileSync(storageFile, 'utf8')}\nwindow.__defaults = FALLBACK_DEFAULTS;`;
  const context = {
    console,
    window: {},
    FirestoreService: {
      init() {},
      generateUUID(prefix = 'id') {
        return `${prefix}-${Date.now()}`;
      }
    }
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(source, context, { filename: storageFile });
  return context.__defaults;
}

async function seedFirestore(adminUser) {
  const defaults = loadDefaults();
  const now = new Date().toISOString();

  await writeDoc('settings', 'app', {
    ...defaults.settings,
    updatedAt: now
  });

  for (const ad of defaults.ads || []) {
    await writeDoc('ads', ad.id, ad);
    await writeDoc('adAnalytics', ad.id, {
      id: ad.id,
      impressions: 0,
      completedViews: 0,
      skippedViews: 0,
      totalRewards: 0,
      totalWatchTime: 0,
      averageWatchTime: 0,
      lastShownAt: null
    });
  }

  if (adminUser.uid) await writeAdminProfile(adminUser);
}

async function writeAdminProfile(adminUser) {
  if (!adminUser.uid) return false;
  const now = new Date().toISOString();
  await writeDoc('users', adminUser.uid, {
    id: adminUser.uid,
    name: 'Platform Admin',
    email: adminUser.email,
    password: null,
    role: 'admin',
    balance: 0,
    totalViews: 0,
    todayViews: 0,
    xp: 0,
    level: 'ماسي',
    status: 'active',
    joinDate: now,
    lastWatchDate: now.split('T')[0],
    lastDailyResetAt: now,
    pendingWithdrawalId: null,
    lastWithdrawalId: null,
    lastWithdrawalAt: null,
    lastRewardSessionId: null,
    lastRewardAt: null,
    earnings: [],
    timeline: [
      {
        id: `timeline-${Date.now()}`,
        date: now,
        type: 'إدارة',
        message: 'تم إنشاء حساب الأدمن الأول أثناء تجهيز Firebase.'
      }
    ]
  });
  return true;
}

async function main() {
  const command = process.argv[2] || 'all';

  if (command === 'enable-auth' || command === 'all') {
    await enableAuth();
    console.log('auth_enabled=true');
  }

  let adminUser = { email: ADMIN_EMAIL, password: null, uid: null, existed: true };
  if (command === 'create-admin' || command === 'all') {
    adminUser = await createAdminAuthUser();
    console.log(`admin_email=${adminUser.email}`);
    console.log(`admin_uid=${adminUser.uid || 'existing'}`);
    console.log(`admin_password=${adminUser.password || 'UNCHANGED_EXISTING_USER'}`);
    if (adminUser.uid) {
      await writeAdminProfile(adminUser);
      console.log('admin_profile_written=true');
    }
  }

  if (command === 'seed' || command === 'all') {
    await seedFirestore(adminUser);
    console.log('firestore_seeded=true');
  }

  if (command === 'verify') {
    const settings = await readFirestoreDoc('settings', 'app');
    const ads = await listFirestoreCollection('ads');
    console.log(`settings_exists=${settings.ok}`);
    console.log(`ads_count=${ads.ok && ads.body.documents ? ads.body.documents.length : 0}`);
  }

  if (command === 'cleanup-e2e') {
    const deleted = await cleanupE2EAds();
    console.log(`e2e_ads_deleted=${deleted}`);
  }

  if (command === 'add-requested-ads') {
    const result = await addRequestedExternalAds();
    console.log(`requested_ads_written=${result.written}`);
    console.log(`requested_ads_analytics_created=${result.analyticsCreated}`);
  }

  if (command === 'reconcile-balances') {
    const result = await reconcileUserBalances();
    console.log(`users_checked=${result.checked}`);
    console.log(`users_balances_updated=${result.updated}`);
  }

  if (command === 'migrate-currency-labels') {
    const result = await migrateCurrencyLabels();
    console.log(`users_checked=${result.checked}`);
    console.log(`users_currency_labels_updated=${result.updated}`);
  }

  if (command === 'set-admin-claims') {
    const user = await setAdminClaims();
    console.log(`admin_claims_set_for=${user.id}`);
    console.log(`admin_email=${user.email || ADMIN_EMAIL}`);
  }
}

main().catch(error => {
  console.error(error.message || error);
  process.exit(1);
});
