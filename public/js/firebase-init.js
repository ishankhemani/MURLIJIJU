/**
 * firebase-init.js
 * 
 * Initializes Firebase SDK with App Check (reCAPTCHA v3).
 * This module must be imported before any Firestore or Functions usage.
 * 
 * Security Model:
 * - Firebase App Check with reCAPTCHA v3 ensures requests come from
 *   the real browser app, not arbitrary scripts or tools.
 * - All sensitive writes go through Cloud Functions which re-validate data.
 * - Firestore rules require App Check tokens and constrain query patterns.
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getFirestore, connectFirestoreEmulator } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { getFunctions, connectFunctionsEmulator } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-functions.js";
import { initializeAppCheck, ReCaptchaV3Provider } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app-check.js";
import { firebaseConfig, RECAPTCHA_SITE_KEY, FUNCTIONS_REGION } from "./firebase-config.js";

// ─── Initialize Firebase App ───────────────────────────────────────────────
let app, db, functions, appCheck;

const IS_EMULATOR = location.hostname === "localhost" || location.hostname === "127.0.0.1";
const IS_PLACEHOLDER = firebaseConfig.apiKey === "YOUR_API_KEY";

export function initFirebase() {
  if (IS_PLACEHOLDER) {
    console.warn(
      "[JijuBill] Firebase is not configured. " +
      "Open public/js/firebase-config.js and replace placeholder values. " +
      "The app will run in local-only mode."
    );
    return { db: null, functions: null, configured: false };
  }

  try {
    app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    functions = getFunctions(app, FUNCTIONS_REGION);

    if (IS_EMULATOR) {
      // Connect to local Firebase Emulators
      connectFirestoreEmulator(db, "localhost", 8080);
      connectFunctionsEmulator(functions, "localhost", 5001);
      console.info("[JijuBill] Connected to Firebase Emulators");
    } else {
      // Initialize App Check with reCAPTCHA v3 in production
      if (RECAPTCHA_SITE_KEY && RECAPTCHA_SITE_KEY !== "YOUR_RECAPTCHA_V3_SITE_KEY") {
        appCheck = initializeAppCheck(app, {
          provider: new ReCaptchaV3Provider(RECAPTCHA_SITE_KEY),
          isTokenAutoRefreshEnabled: true
        });
        console.info("[JijuBill] Firebase App Check initialized");
      } else {
        console.warn("[JijuBill] App Check not initialized — configure RECAPTCHA_SITE_KEY for production security");
      }
    }

    console.info("[JijuBill] Firebase initialized");
    return { db, functions, configured: true };
  } catch (err) {
    console.error("[JijuBill] Firebase initialization failed:", err);
    return { db: null, functions: null, configured: false, error: err };
  }
}

export function getDb() { return db; }
export function getFunctionsInstance() { return functions; }
export function isFirebaseConfigured() { return !IS_PLACEHOLDER && !!db; }
