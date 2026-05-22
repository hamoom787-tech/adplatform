'use strict';

const { db } = require('../firebase-admin');

let cachedSettings = null;
let cachedAt = 0;
const TTL_MS = 60 * 1000;

async function getSettings(tx = null, force = false) {
  if (!tx && !force && cachedSettings && Date.now() - cachedAt < TTL_MS) {
    return cachedSettings;
  }
  const ref = db.collection('settings').doc('app');
  const snap = tx ? await tx.get(ref) : await ref.get();
  const settings = snap.exists ? snap.data() : {};
  if (!tx) {
    cachedSettings = settings;
    cachedAt = Date.now();
  }
  return settings;
}

module.exports = {
  getSettings
};
