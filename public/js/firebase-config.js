/**
 * firebase-config.js
 * Firebase project: murlijiju
 */

export const firebaseConfig = {
  apiKey:            "AIzaSyCpD0QKmW6f_jf1MC_KubGtM7tTctGKijQ",
  authDomain:        "murlijiju.firebaseapp.com",
  projectId:         "murlijiju",
  storageBucket:     "murlijiju.firebasestorage.app",
  messagingSenderId: "857138151027",
  appId:             "1:857138151027:web:cd88fbc7a903ba1be8f406",
  measurementId:     "G-WM3QYMB3HS"
};

/**
 * reCAPTCHA v3 site key for Firebase App Check.
 * 
 * HOW TO GET THIS:
 * 1. Go to https://www.google.com/recaptcha/admin/create
 * 2. Choose reCAPTCHA v3
 * 3. Add your domains (e.g., murlijiju.web.app, localhost)
 * 4. Paste the SITE KEY (not the secret key) here.
 * 
 * Until you add this, App Check will run in debug mode on localhost.
 * Bills will NOT save to Firestore without a valid App Check token in production.
 */
export const RECAPTCHA_SITE_KEY = "YOUR_RECAPTCHA_V3_SITE_KEY";

/**
 * Firebase Cloud Functions region.
 * Default is us-central1. Change only if you deployed functions elsewhere.
 */
export const FUNCTIONS_REGION = "us-central1";
