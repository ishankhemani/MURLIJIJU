/**
 * customer-service.js
 * 
 * Customer CRUD operations.
 * Reads go directly to Firestore.
 * Writes go through Cloud Functions for validation.
 */

import {
  collection, doc, getDoc, getDocs,
  query, orderBy, limit, startAfter, where
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-functions.js";
import { getDb, getFunctionsInstance, isFirebaseConfigured } from "../firebase-init.js";

const CUSTOMERS_COLLECTION = "customers";
const PAGE_SIZE = 20;

// ─── In-Memory Customer Suggestions Cache ─────────────────────────────────
// Only caches a small set of recent customers for autocomplete
const _suggestionCache = new Map();

// ─── Read Operations ───────────────────────────────────────────────────────

/**
 * Get a single customer by ID.
 * @param {string} customerId
 * @returns {Promise<object|null>}
 */
export async function getCustomerById(customerId) {
  if (!isFirebaseConfigured() || !customerId) return null;

  const db   = getDb();
  const ref  = doc(db, CUSTOMERS_COLLECTION, customerId);
  const snap = await getDoc(ref);

  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

/**
 * Get customers with pagination.
 * @param {object} [options]
 * @returns {Promise<{ customers: object[], lastDoc: object|null, hasMore: boolean }>}
 */
export async function getCustomersPaginated(options = {}) {
  if (!isFirebaseConfigured()) return { customers: [], lastDoc: null, hasMore: false };

  const { pageSize = PAGE_SIZE, cursor = null } = options;
  const db = getDb();

  let q = query(
    collection(db, CUSTOMERS_COLLECTION),
    orderBy("nameLower"),
    limit(pageSize + 1)
  );

  if (cursor) {
    q = query(
      collection(db, CUSTOMERS_COLLECTION),
      orderBy("nameLower"),
      startAfter(cursor),
      limit(pageSize + 1)
    );
  }

  const snap = await getDocs(q);
  const docs = snap.docs;
  const hasMore    = docs.length > pageSize;
  const customers  = docs.slice(0, pageSize).map(d => ({ id: d.id, ...d.data() }));
  const lastDoc    = customers.length > 0 ? docs[customers.length - 1] : null;

  return { customers, lastDoc, hasMore };
}

/**
 * Search customers by name prefix (case-insensitive).
 * @param {string} namePrefix
 * @param {number} [maxResults=10]
 * @returns {Promise<object[]>}
 */
export async function searchCustomers(namePrefix, maxResults = 10) {
  if (!isFirebaseConfigured() || !namePrefix) return [];

  const cacheKey = namePrefix.toLowerCase().trim();
  if (_suggestionCache.has(cacheKey)) {
    return _suggestionCache.get(cacheKey);
  }

  const term     = namePrefix.trim().toLowerCase();
  const termEnd  = term + "\uf8ff";

  const db = getDb();
  const q = query(
    collection(db, CUSTOMERS_COLLECTION),
    where("nameLower", ">=", term),
    where("nameLower", "<=", termEnd),
    orderBy("nameLower"),
    limit(maxResults)
  );

  const snap    = await getDocs(q);
  const results = snap.docs.map(d => ({ id: d.id, ...d.data() }));

  // Cache the suggestions (small, bounded)
  if (_suggestionCache.size > 50) {
    const firstKey = _suggestionCache.keys().next().value;
    _suggestionCache.delete(firstKey);
  }
  _suggestionCache.set(cacheKey, results);

  return results;
}

// ─── Write Operations (via Cloud Functions) ───────────────────────────────

/**
 * Create a new customer.
 * @param {object} customerData - { name, phone, address, notes }
 * @returns {Promise<object>} Created customer
 */
export async function createCustomer(customerData) {
  if (!isFirebaseConfigured()) {
    throw new Error("Firebase is not configured.");
  }

  const functions = getFunctionsInstance();
  const fn = httpsCallable(functions, "createCustomer");
  const result = await fn(customerData);

  if (!result.data?.success) {
    throw new Error(result.data?.error || "Failed to create customer");
  }

  // Invalidate cache
  _suggestionCache.clear();
  return result.data.customer;
}

/**
 * Update an existing customer.
 * @param {string} customerId
 * @param {object} updates
 * @returns {Promise<object>} Updated customer
 */
export async function updateCustomer(customerId, updates) {
  if (!isFirebaseConfigured()) {
    throw new Error("Firebase is not configured.");
  }

  const functions = getFunctionsInstance();
  const fn = httpsCallable(functions, "updateCustomer");
  const result = await fn({ customerId, ...updates });

  if (!result.data?.success) {
    throw new Error(result.data?.error || "Failed to update customer");
  }

  _suggestionCache.clear();
  return result.data.customer;
}

/**
 * Delete a customer.
 * Historical bills retain the customer snapshot — the snapshot is NOT deleted.
 * @param {string} customerId
 * @returns {Promise<void>}
 */
export async function deleteCustomer(customerId) {
  if (!isFirebaseConfigured()) {
    throw new Error("Firebase is not configured.");
  }

  const functions = getFunctionsInstance();
  const fn = httpsCallable(functions, "deleteCustomer");
  const result = await fn({ customerId });

  if (!result.data?.success) {
    throw new Error(result.data?.error || "Failed to delete customer");
  }

  _suggestionCache.clear();
}

/**
 * Get bills for a specific customer (paginated).
 * @param {string} customerId
 * @param {object} [cursor]
 * @param {number} [pageSize=20]
 * @returns {Promise<{ bills: object[], lastDoc: object|null, hasMore: boolean }>}
 */
export async function getCustomerBills(customerId, cursor = null, pageSize = 20) {
  if (!isFirebaseConfigured() || !customerId) return { bills: [], lastDoc: null, hasMore: false };

  const db = getDb();
  let q = query(
    collection(db, "bills"),
    where("customerId", "==", customerId),
    orderBy("billDateTs", "desc"),
    limit(pageSize + 1)
  );

  if (cursor) {
    q = query(
      collection(db, "bills"),
      where("customerId", "==", customerId),
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
