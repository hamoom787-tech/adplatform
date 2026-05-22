/* ============================================================
   firebase.js - Firebase initialization and shared instances
   ============================================================ */

'use strict';

const firebaseConfig = {
  apiKey: 'AIzaSyClqe7K3eRiL5g46UFcQqms5e1Hzc69wNk',
  authDomain: 'adplatform-4d5a0.firebaseapp.com',
  projectId: 'adplatform-4d5a0',
  storageBucket: 'adplatform-4d5a0.firebasestorage.app',
  messagingSenderId: '47580119880',
  appId: '1:47580119880:web:f4488011617d01ae0ca97d'
};

const FirebaseService = {
  config: firebaseConfig,
  app: null,
  auth: null,
  db: null,
  FieldValue: null,
  isConfigured: false,
  isAvailable: false,

  init() {
    const hasSdk = typeof window.firebase !== 'undefined'
      && typeof window.firebase.initializeApp === 'function'
      && typeof window.firebase.auth === 'function'
      && typeof window.firebase.firestore === 'function';

    this.isConfigured = !Object.values(this.config).some(value => String(value || '').startsWith('REPLACE_WITH_'));

    if (!hasSdk) {
      console.warn('[Firebase] SDK scripts are not loaded. Add Firebase CDN scripts before js/firebase.js.');
      return this;
    }

    if (!this.isConfigured) {
      console.warn('[Firebase] firebaseConfig still contains placeholders. Follow FIREBASE_SETUP.md before production use.');
      return this;
    }

    this.app = window.firebase.apps.length
      ? window.firebase.app()
      : window.firebase.initializeApp(this.config);

    this.auth = window.firebase.auth();
    this.db = window.firebase.firestore();
    this.FieldValue = window.firebase.firestore.FieldValue;
    this.isAvailable = true;

    return this;
  }
};

FirebaseService.init();
window.FirebaseService = FirebaseService;
