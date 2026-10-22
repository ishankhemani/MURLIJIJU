/**
 * firebase-init.js
 *
 * Initializes Firebase SDK.
 * Connects directly to Firebase cloud (no emulator).
 * App Check is optional — skipped if reCAPTCHA key not set yet.
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getFirestore }  from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { getFunctions }  from "https://www.gstatic.com/firebasejs/10.14.1/firebase-functions.js";
import { initializeAppCheck, ReCaptchaV3Provider } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app-check.js";
import { firebaseConfig, RECAPTCHA_SITE_KEY, FUNCTIONS_REGION } from "./firebase-config.js";

let app, db, functions;

const IS_PLACEHOLDER = firebaseConfig.apiKey === "YOUR_API_KEY";

export function initFirebase() {
  if (IS_PLACEHOLDER) {
    console.warn("[JijuBill] Firebase not configured — open firebase-config.js and add credentials.");
    return { db: null, functions: null, configured: false };
  }

  try {
    app       = initializeApp(firebaseConfig);
    db        = getFirestore(app);          // ← connects to real Firebase cloud
    functions = getFunctions(app, FUNCTIONS_REGION);

    // App Check — only if reCAPTCHA key is configured
    if (RECAPTCHA_SITE_KEY && RECAPTCHA_SITE_KEY !== "YOUR_RECAPTCHA_V3_SITE_KEY") {
      initializeAppCheck(app, {
        provider: new ReCaptchaV3Provider(RECAPTCHA_SITE_KEY),
        isTokenAutoRefreshEnabled: true
      });
      console.info("[JijuBill] App Check initialized");
    }

    console.info("[JijuBill] Firebase connected to project:", firebaseConfig.projectId);
    return { db, functions, configured: true };
  } catch (err) {
    console.error("[JijuBill] Firebase init failed:", err);
    return { db: null, functions: null, configured: false, error: err };
  }
}

export function getDb()               { return db; }
export function getFunctionsInstance(){ return functions; }
export function isFirebaseConfigured(){ return !IS_PLACEHOLDER && !!db; }
