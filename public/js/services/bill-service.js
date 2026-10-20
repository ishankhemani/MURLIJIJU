/**
 * bill-service.js
 * 
 * Handles all bill CRUD operations.
 * 
 * SECURITY MODEL:
 * - createBill and editBill go through Cloud Functions (HTTPS callable)
 *   which validate, recalculate, allocate bill numbers atomically, and
 *   write to Firestore with server timestamps.
 * - Reads go directly to Firestore (allowed by security rules with App Check).
 * - Idempotency keys prevent duplicate bills on retry.
 */

import {
  collection, doc, getDoc, getDocs,
  query, orderBy, limit, startAfter,
  where, getCountFromServer, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-functions.js";
import { getDb, getFunctionsInstance, isFirebaseConfigured } from "../firebase-init.js";
import { generateIdempotencyKey } from "./numbering-service.js";

const BILLS_COLLECTION = "bills";
const PAGE_SIZE_DEFAULT = 20;

// ─── Create Bill ───────────────────────────────────────────────────────────

/**
 * Create a new bill via Cloud Function.
 * The function: validates, recalculates, allocates number atomically, saves.
 * 
 * @param {object} billData - Form data (without billNumber or official IDs)
 * @param {string} idempotencyKey - UUID to prevent duplicate creation on retry
 * @returns {Promise<object>} The saved bill document with official billNumber
 */
export async function createBill(billData, idempotencyKey) {
  if (!isFirebaseConfigured()) {
    throw new Error("Firebase is not configured. Please update firebase-config.js.");
  }

  const functions = getFunctionsInstance();
  const createBillFn = httpsCallable(functions, "createBill");

  const result = await createBillFn({
    ...billData,
    idempotencyKey
  });

  if (!result.data || !result.data.success) {
    throw new Error(result.data?.error || "Failed to create bill");
  }

  return result.data.bill;
}

/**
 * Edit an existing bill via Cloud Function.
 * Preserves: billNumber, createdAt. Updates: all other fields, updatedAt.
 * 
 * @param {string} billId - Firestore document ID
 * @param {object} updates - Updated bill data
 * @returns {Promise<object>} Updated bill document
 */
export async function editBill(billId, updates) {
  if (!isFirebaseConfigured()) {
    throw new Error("Firebase is not configured.");
  }

  const functions = getFunctionsInstance();
  const editBillFn = httpsCallable(functions, "editBill");

  const result = await editBillFn({ billId, ...updates });

  if (!result.data || !result.data.success) {
    throw new Error(result.data?.error || "Failed to update bill");
  }

  return result.data.bill;
}

/**
 * Delete a bill via Cloud Function.
 * Never reuses the deleted bill number.
 * 
 * @param {string} billId
 * @returns {Promise<void>}
 */
export async function deleteBill(billId) {
  if (!isFirebaseConfigured()) {
    throw new Error("Firebase is not configured.");
  }

  const functions = getFunctionsInstance();
  const deleteBillFn = httpsCallable(functions, "deleteBill");

  const result = await deleteBillFn({ billId });

  if (!result.data || !result.data.success) {
    throw new Error(result.data?.error || "Failed to delete bill");
  }
}

// ─── Read Operations ───────────────────────────────────────────────────────

/**
 * Get a single bill by its Firestore document ID.
 * @param {string} billId
 * @returns {Promise<object|null>}
 */
export async function getBillById(billId) {
  if (!isFirebaseConfigured()) return null;

  const db  = getDb();
  const ref = doc(db, BILLS_COLLECTION, billId);
  const snap = await getDoc(ref);

  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

/**
 * Get bills with pagination using cursor-based approach.
 * 
 * @param {object} options
 * @param {number}   [options.pageSize=20]
 * @param {object}   [options.cursor] - Last document from previous page (for next page)
 * @param {string}   [options.orderField="createdAt"]
 * @param {"asc"|"desc"} [options.orderDir="desc"]
 * @returns {Promise<{ bills: object[], lastDoc: object|null, hasMore: boolean }>}
 */
export async function getBillsPaginated(options = {}) {
  if (!isFirebaseConfigured()) return { bills: [], lastDoc: null, hasMore: false };

  const {
    pageSize   = PAGE_SIZE_DEFAULT,
    cursor     = null,
    orderField = "billDateTs",
    orderDir   = "desc"
  } = options;

  const db = getDb();
  const colRef = collection(db, BILLS_COLLECTION);

  let q = query(colRef, orderBy(orderField, orderDir), limit(pageSize + 1));
  if (cursor) {
    q = query(colRef, orderBy(orderField, orderDir), startAfter(cursor), limit(pageSize + 1));
  }

  const snap = await getDocs(q);
  const docs = snap.docs;

  const hasMore = docs.length > pageSize;
  const bills   = docs.slice(0, pageSize).map(d => ({ id: d.id, ...d.data() }));
  const lastDoc = bills.length > 0 ? docs[bills.length - 1] : null;

  return { bills, lastDoc, hasMore };
}

// ─── Search ───────────────────────────────────────────────────────────────

/**
 * Search bills by bill number (exact match).
 * @param {string} billNumber
 * @returns {Promise<object[]>}
 */
export async function searchByBillNumber(billNumber) {
  if (!isFirebaseConfigured() || !billNumber) return [];

  const db = getDb();
  const q = query(
    collection(db, BILLS_COLLECTION),
    where("billNumber", "==", billNumber.trim().toUpperCase()),
    limit(5)
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/**
 * Search bills by customer name prefix.
 * Uses lowercase snapshot field for case-insensitive prefix search.
 * Firestore limitation: no full-text substring search.
 * 
 * @param {string} namePrefix
 * @param {number} [maxResults=20]
 * @returns {Promise<object[]>}
 */
export async function searchByCustomerName(namePrefix, maxResults = 20) {
  if (!isFirebaseConfigured() || !namePrefix) return [];

  const term     = namePrefix.trim().toLowerCase();
  const termEnd  = term + "\uf8ff"; // Unicode range end trick for prefix search

  const db = getDb();
  const q = query(
    collection(db, BILLS_COLLECTION),
    where("customerNameLower", ">=", term),
    where("customerNameLower", "<=", termEnd),
    orderBy("customerNameLower"),
    limit(maxResults)
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/**
 * Search bills by customer phone number.
 * @param {string} phone
 * @returns {Promise<object[]>}
 */
export async function searchByPhone(phone, maxResults = 20) {
  if (!isFirebaseConfigured() || !phone) return [];

  const db = getDb();
  const q = query(
    collection(db, BILLS_COLLECTION),
    where("customerPhoneSnapshot", "==", phone.trim()),
    orderBy("billDateTs", "desc"),
    limit(maxResults)
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/**
 * Search bills by particular (commodity) prefix.
 * @param {string} particular
 * @param {number} [maxResults=20]
 * @returns {Promise<object[]>}
 */
export async function searchByParticular(particular, maxResults = 20) {
  if (!isFirebaseConfigured() || !particular) return [];

  const term    = particular.trim().toLowerCase();
  const termEnd = term + "\uf8ff";

  const db = getDb();
  const q = query(
    collection(db, BILLS_COLLECTION),
    where("particularLower", ">=", term),
    where("particularLower", "<=", termEnd),
    orderBy("particularLower"),
    limit(maxResults)
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/**
 * Search bills within a date range.
 * @param {string} startDate - YYYY-MM-DD
 * @param {string} endDate   - YYYY-MM-DD
 * @param {object} [cursor]
 * @param {number} [pageSize=20]
 * @returns {Promise<{ bills: object[], lastDoc: object|null, hasMore: boolean }>}
 */
export async function searchByDateRange(startDate, endDate, cursor = null, pageSize = 20) {
  if (!isFirebaseConfigured()) return { bills: [], lastDoc: null, hasMore: false };

  const startTs = new Date(startDate).getTime();
  const endTs   = new Date(endDate + "T23:59:59").getTime();

  const db = getDb();
  let q = query(
    collection(db, BILLS_COLLECTION),
    where("billDateTs", ">=", startTs),
    where("billDateTs", "<=", endTs),
    orderBy("billDateTs", "desc"),
    limit(pageSize + 1)
  );

  if (cursor) {
    q = query(
      collection(db, BILLS_COLLECTION),
      where("billDateTs", ">=", startTs),
      where("billDateTs", "<=", endTs),
      orderBy("billDateTs", "desc"),
      startAfter(cursor),
      limit(pageSize + 1)
    );
  }

  const snap = await getDocs(q);
  const docs = snap.docs;
  const hasMore = docs.length > pageSize;
  const bills   = docs.slice(0, pageSize).map(d => ({ id: d.id, ...d.data() }));
  const lastDoc = bills.length > 0 ? docs[bills.length - 1] : null;

  return { bills, lastDoc, hasMore };
}

/**
 * Get recent bills (for the dashboard summary, limited count).
 * @param {number} [count=5]
 * @returns {Promise<object[]>}
 */
export async function getRecentBills(count = 5) {
  if (!isFirebaseConfigured()) return [];

  const db = getDb();
  const q = query(
    collection(db, BILLS_COLLECTION),
    orderBy("createdAt", "desc"),
    limit(count)
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// ─── Utility ──────────────────────────────────────────────────────────────

/**
 * Generate a fresh idempotency key for bill creation.
 * @returns {string}
 */
export function newIdempotencyKey() {
  return generateIdempotencyKey();
}
