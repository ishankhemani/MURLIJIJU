/**
 * firebase-init.js
 *
 * Initializes Firebase SDK.
 * Connects DIRECTLY to Firebase cloud — no emulator, no Cloud Functions.
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getFirestore,
  enableNetwork
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

let app, db;

const IS_PLACEHOLDER = !firebaseConfig.apiKey || firebaseConfig.apiKey === "YOUR_API_KEY";

export function initFirebase() {
  if (IS_PLACEHOLDER) {
    console.warn("[JijuBill] Firebase not configured.");
    return { db: null, configured: false };
  }

  try {
    app = initializeApp(firebaseConfig);
    db  = getFirestore(app);

    // Force Firestore to go online and establish connection immediately
    enableNetwork(db).catch(() => {});

    console.info("[JijuBill] Firebase connected →", firebaseConfig.projectId);
    return { db, configured: true };
  } catch (err) {
    console.error("[JijuBill] Firebase init failed:", err);
    return { db: null, configured: false };
  }
}

export function getDb()               { return db; }
export function isFirebaseConfigured(){ return !IS_PLACEHOLDER && !!db; }
export function getFunctionsInstance(){ return null; }
