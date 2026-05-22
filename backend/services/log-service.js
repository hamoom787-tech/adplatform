'use strict';

const { db, FieldValue } = require('../firebase-admin');
const { randomId } = require('../utils/crypto');

function nowIso() {
  return new Date().toISOString();
}

async function writeLog(type, detail = {}, severity = 'info') {
  const ref = db.collection('logs').doc();
  const payload = {
    id: ref.id,
    type,
    severity,
    detail,
    date: nowIso(),
    createdAt: FieldValue.serverTimestamp()
  };
  await ref.set(payload).catch(() => {});
  return payload;
}

async function securityIncident(type, detail = {}, severity = 'medium') {
  const id = randomId('incident');
  const payload = {
    id,
    type,
    severity,
    detail,
    date: nowIso(),
    createdAt: FieldValue.serverTimestamp()
  };
  await Promise.allSettled([
    db.collection('securityIncidents').doc(id).set(payload),
    writeLog(type, detail, severity)
  ]);
  return payload;
}

module.exports = {
  writeLog,
  securityIncident
};
