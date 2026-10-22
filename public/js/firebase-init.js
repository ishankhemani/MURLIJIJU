/**
 * firebase-init.js
 *
 * Initializes Firebase SDK.
 * Connects DIRECTLY to Firebase cloud — no emulator, no Cloud Functions.
 * App Check is optional — only active if reCAPTCHA site key is configured.
 */

import { initializeApp }   from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getFirestore }     from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { initializeAppCheck, ReCaptchaV3Provider } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app-check.js";
import { firebaseConfig, RECAPTCHA_SITE_KEY } from "./firebase-config.js";

let app, db;

const IS_PLACEHOLDER = !firebaseConfig.apiKey || firebaseConfig.apiKey === "YOUR_API_KEY";

export function initFirebase() {
  if (IS_PLACEHOLDER) {
    console.warn("[JijuBill] Firebase not configured — open firebase-config.js and add credentials.");
    return { db: null, configured: false };
  }

  try {
    app = initializeApp(firebaseConfig);
    db  = getFirestore(app);  // ← connects to real Firebase cloud, no emulator

    // App Check is optional — only init if reCAPTCHA key is properly set
    if (RECAPTCHA_SITE_KEY && RECAPTCHA_SITE_KEY !== "YOUR_RECAPTCHA_V3_SITE_KEY") {
      initializeAppCheck(app, {
        provider: new ReCaptchaV3Provider(RECAPTCHA_SITE_KEY),
        isTokenAutoRefreshEnabled: true
      });
      console.info("[JijuBill] App Check initialized");
    }
    // Note: App Check warning suppressed — it's optional for this app

    console.info("[JijuBill] Firebase connected →", firebaseConfig.projectId);
    return { db, configured: true };
  } catch (err) {
    console.error("[JijuBill] Firebase init failed:", err);
    return { db: null, configured: false };
  }
}

export function getDb()               { return db; }
export function isFirebaseConfigured(){ return !IS_PLACEHOLDER && !!db; }

// Keep for any legacy imports that might reference this
export function getFunctionsInstance(){ return null; }
