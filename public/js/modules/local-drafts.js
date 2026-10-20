/**
 * local-drafts.js
 * 
 * Manages unsaved bill drafts using IndexedDB.
 * A draft is NOT an officially saved bill — no bill number is assigned.
 * Drafts survive page refreshes so the owner doesn't lose work.
 */

const DB_NAME    = "jijubill-drafts";
const DB_VERSION = 1;
const STORE_NAME = "drafts";
const DRAFT_KEY  = "current-bill-draft";

let _db = null;

// ─── DB Initialization ─────────────────────────────────────────────────────

async function openDb() {
  if (_db) return _db;

  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "key" });
      }
    };

    req.onsuccess = (e) => {
      _db = e.target.result;
      resolve(_db);
    };

    req.onerror = () => {
      console.warn("[Drafts] IndexedDB unavailable, using localStorage fallback");
      resolve(null);
    };
  });
}

// ─── Core Operations ───────────────────────────────────────────────────────

/**
 * Save a draft bill to IndexedDB (or localStorage fallback).
 * @param {object} draftData - The form data to save as draft
 * @returns {Promise<void>}
 */
export async function saveDraft(draftData) {
  const payload = {
    key:       DRAFT_KEY,
    data:      draftData,
    savedAt:   new Date().toISOString(),
    isDraft:   true
  };

  try {
    const db = await openDb();
    if (db) {
      return new Promise((resolve, reject) => {
        const tx    = db.transaction(STORE_NAME, "readwrite");
        const store = tx.objectStore(STORE_NAME);
        const req   = store.put(payload);
        req.onsuccess = () => resolve();
        req.onerror   = () => reject(req.error);
      });
    } else {
      // Fallback to localStorage
      localStorage.setItem(DRAFT_KEY, JSON.stringify(payload));
    }
  } catch (err) {
    console.warn("[Drafts] Failed to save draft:", err);
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(payload));
    } catch (e) {
      // Storage full or unavailable
    }
  }
}

/**
 * Load the saved draft from IndexedDB (or localStorage fallback).
 * @returns {Promise<object|null>} The draft data, or null if none exists
 */
export async function loadDraft() {
  try {
    const db = await openDb();
    if (db) {
      return new Promise((resolve) => {
        const tx    = db.transaction(STORE_NAME, "readonly");
        const store = tx.objectStore(STORE_NAME);
        const req   = store.get(DRAFT_KEY);
        req.onsuccess = () => {
          const result = req.result;
          if (result && result.isDraft) {
            resolve(result.data);
          } else {
            resolve(null);
          }
        };
        req.onerror = () => resolve(null);
      });
    } else {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed?.isDraft ? parsed.data : null;
    }
  } catch {
    return null;
  }
}

/**
 * Clear the current draft after successful save.
 * @returns {Promise<void>}
 */
export async function clearDraft() {
  try {
    const db = await openDb();
    if (db) {
      return new Promise((resolve) => {
        const tx    = db.transaction(STORE_NAME, "readwrite");
        const store = tx.objectStore(STORE_NAME);
        const req   = store.delete(DRAFT_KEY);
        req.onsuccess = () => resolve();
        req.onerror   = () => resolve();
      });
    } else {
      localStorage.removeItem(DRAFT_KEY);
    }
  } catch {
    try { localStorage.removeItem(DRAFT_KEY); } catch {}
  }
}

/**
 * Check if a draft exists.
 * @returns {Promise<boolean>}
 */
export async function hasDraft() {
  const draft = await loadDraft();
  return !!draft && Object.keys(draft).some(k => draft[k] !== "" && draft[k] !== null);
}

/**
 * Get the timestamp when the draft was last saved.
 * @returns {Promise<string|null>}
 */
export async function getDraftTimestamp() {
  try {
    const db = await openDb();
    if (db) {
      return new Promise((resolve) => {
        const tx    = db.transaction(STORE_NAME, "readonly");
        const store = tx.objectStore(STORE_NAME);
        const req   = store.get(DRAFT_KEY);
        req.onsuccess = () => resolve(req.result?.savedAt || null);
        req.onerror   = () => resolve(null);
      });
    } else {
      const raw = localStorage.getItem(DRAFT_KEY);
      return raw ? JSON.parse(raw)?.savedAt : null;
    }
  } catch {
    return null;
  }
}
