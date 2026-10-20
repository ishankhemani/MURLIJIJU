/**
 * settings-service.js
 * 
 * Manages business settings.
 * - Reads from Firestore (or local cache when offline)
 * - Writes through Cloud Functions
 * - Caches in memory for fast access during the session
 */

import {
  doc, getDoc, setDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { getDb, isFirebaseConfigured } from "../firebase-init.js";

// ─── In-Memory Cache ───────────────────────────────────────────────────────

const SETTINGS_CACHE_KEY = "jijubill-settings";
let _settingsCache = null;
let _cacheLoaded   = false;

const DEFAULT_SETTINGS = {
  businessName:                "",
  businessAddress:             "",
  phone:                       "",
  email:                       "",
  billPrefix:                  "BILL",
  defaultCommissionPerQuintal: 0,
  currency:                    "INR",
  theme:                       "light",
  logoBase64:                  "",
  signatureBase64:             "",
  bankDetails:                 ""
};

// ─── Load Settings ─────────────────────────────────────────────────────────

/**
 * Load settings from cache first, then Firestore.
 * @param {boolean} [forceRefresh=false]
 * @returns {Promise<object>}
 */
export async function loadSettings(forceRefresh = false) {
  // Return from memory cache
  if (_cacheLoaded && !forceRefresh && _settingsCache) {
    return _settingsCache;
  }

  // Try localStorage cache first (fast startup)
  if (!forceRefresh) {
    const localData = loadLocalSettings();
    if (localData) {
      _settingsCache = localData;
      _cacheLoaded = true;
      // Refresh from Firestore in background
      if (isFirebaseConfigured()) {
        refreshSettingsFromFirestore().catch(err =>
          console.warn("[Settings] Background refresh failed:", err)
        );
      }
      return _settingsCache;
    }
  }

  // Load from Firestore
  if (isFirebaseConfigured()) {
    try {
      const settings = await fetchSettingsFromFirestore();
      _settingsCache = { ...DEFAULT_SETTINGS, ...settings };
      _cacheLoaded = true;
      saveLocalSettings(_settingsCache);
      return _settingsCache;
    } catch (err) {
      console.warn("[Settings] Firestore load failed, using defaults:", err);
    }
  }

  _settingsCache = { ...DEFAULT_SETTINGS };
  _cacheLoaded = true;
  return _settingsCache;
}

/**
 * Get current settings synchronously from cache.
 * Call loadSettings() first to ensure cache is populated.
 * @returns {object}
 */
export function getSettings() {
  return _settingsCache || { ...DEFAULT_SETTINGS };
}

// ─── Save Settings ─────────────────────────────────────────────────────────

/**
 * Save settings to Firestore and update local cache.
 * @param {object} newSettings
 * @returns {Promise<object>} Updated settings
 */
export async function saveSettings(newSettings) {
  const merged = { ...DEFAULT_SETTINGS, ..._settingsCache, ...newSettings };

  // Update local cache immediately (optimistic)
  _settingsCache = merged;
  _cacheLoaded = true;
  saveLocalSettings(merged);

  // Apply theme immediately
  if (merged.theme) {
    applyTheme(merged.theme);
  }

  // Save to Firestore
  if (isFirebaseConfigured()) {
    const db = getDb();
    const settingsRef = doc(db, "settings", "business");

    // Remove non-serializable or derived fields
    const { theme: _t, ...firestoreData } = merged;

    await setDoc(settingsRef, {
      ...firestoreData,
      theme: merged.theme,
      updatedAt: serverTimestamp()
    }, { merge: true });
  }

  return _settingsCache;
}

// ─── Firestore Helpers ─────────────────────────────────────────────────────

async function fetchSettingsFromFirestore() {
  const db = getDb();
  const ref = doc(db, "settings", "business");
  const snap = await getDoc(ref);
  if (snap.exists()) {
    return snap.data();
  }
  return {};
}

async function refreshSettingsFromFirestore() {
  const settings = await fetchSettingsFromFirestore();
  const merged = { ...DEFAULT_SETTINGS, ...settings };
  _settingsCache = merged;
  saveLocalSettings(merged);
}

// ─── Local Cache ───────────────────────────────────────────────────────────

function saveLocalSettings(settings) {
  try {
    // Don't store large base64 images in localStorage (use a smaller flag)
    const toStore = {
      ...settings,
      logoBase64:      settings.logoBase64      ? "[stored-in-idb]" : "",
      signatureBase64: settings.signatureBase64 ? "[stored-in-idb]" : ""
    };
    localStorage.setItem(SETTINGS_CACHE_KEY, JSON.stringify({
      data: toStore,
      ts:   Date.now()
    }));
  } catch {}
}

function loadLocalSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // Expire after 1 hour
    if (Date.now() - parsed.ts > 3600_000) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

// ─── Theme Management ──────────────────────────────────────────────────────

/**
 * Apply a theme to the document.
 * @param {"light"|"dark"|"system"} theme
 */
export function applyTheme(theme) {
  let effectiveTheme = theme;
  if (theme === "system") {
    effectiveTheme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  document.documentElement.setAttribute("data-theme", effectiveTheme);
  try { localStorage.setItem("jijubill-theme", theme); } catch {}
}

/**
 * Initialize theme from settings or local preference (fast startup).
 */
export function initTheme() {
  const savedTheme = (() => {
    try { return localStorage.getItem("jijubill-theme"); } catch { return null; }
  })();

  const theme = savedTheme || "light";
  applyTheme(theme);

  // Watch system preference changes
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  mq.addEventListener("change", () => {
    const current = (() => {
      try { return localStorage.getItem("jijubill-theme"); } catch { return "light"; }
    })();
    if (current === "system") applyTheme("system");
  });
}

/**
 * Toggle between light and dark themes.
 * @returns {"light"|"dark"} The new theme
 */
export function toggleTheme() {
  const current = document.documentElement.getAttribute("data-theme") || "light";
  const next    = current === "dark" ? "light" : "dark";
  applyTheme(next);
  // Update cached settings
  if (_settingsCache) {
    _settingsCache.theme = next;
    saveLocalSettings(_settingsCache);
  }
  return next;
}

/**
 * Get the current effective theme.
 * @returns {"light"|"dark"}
 */
export function getCurrentTheme() {
  return document.documentElement.getAttribute("data-theme") || "light";
}

/**
 * Invalidate settings cache (call after settings are updated elsewhere).
 */
export function invalidateSettingsCache() {
  _cacheLoaded = false;
  _settingsCache = null;
}
