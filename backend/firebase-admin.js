'use strict';

const admin = require('firebase-admin');

function parseServiceAccount() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_BASE64) {
    const json = Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64, 'base64').toString('utf8');
    return JSON.parse(json);
  }

  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    return JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  }

  if (process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
    // ندعم قراءة مفاتيح الخدمة من Render ENV بدون تخزين أي ملف JSON داخل المشروع.
    return {
      projectId: process.env.FIREBASE_PROJECT_ID || 'adplatform-4d5a0',
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: String(process.env.FIREBASE_PRIVATE_KEY).replace(/\\n/g, '\n')
    };
  }

  return null;
}

function initFirebaseAdmin() {
  if (admin.apps.length) {
    return admin.app();
  }

  const serviceAccount = parseServiceAccount();
  const projectId = process.env.FIREBASE_PROJECT_ID || 'adplatform-4d5a0';

  if (serviceAccount) {
    return admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId
    });
  }

  return admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId
  });
}

const app = initFirebaseAdmin();
const db = admin.firestore(app);
const auth = admin.auth(app);
const FieldValue = admin.firestore.FieldValue;
const Timestamp = admin.firestore.Timestamp;

module.exports = {
  admin,
  app,
  db,
  auth,
  FieldValue,
  Timestamp
};
