'use strict';

const { auth, db } = require('../firebase-admin');
const { appError } = require('../utils/app-error');

async function setUserClaims(adminUid, data = {}) {
  const uid = String(data.uid || '').trim();
  if (!uid) throw appError(400, 'missing_uid', 'uid is required.');

  const adminClaim = data.admin === true;
  const moderatorClaim = data.moderator === true || adminClaim;
  await auth.setCustomUserClaims(uid, {
    admin: adminClaim,
    moderator: moderatorClaim
  });

  await db.collection('users').doc(uid).set({
    role: adminClaim ? 'admin' : (moderatorClaim ? 'moderator' : 'user'),
    claimsUpdatedAt: new Date().toISOString(),
    claimsUpdatedBy: adminUid
  }, { merge: true });

  return { valid: true, uid, admin: adminClaim, moderator: moderatorClaim };
}

module.exports = {
  setUserClaims
};
