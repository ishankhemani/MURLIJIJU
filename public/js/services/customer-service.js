/**
 * customer-service.js
 *
 * Customer CRUD — reads + writes go directly to Firestore.
 * No Cloud Functions dependency. Works on localhost and Netlify immediately.
 */

import {
  collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc,
  query, orderBy, limit, startAfter, where, serverTimestamp, increment
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { getDb, isFirebaseConfigured } from "../firebase-init.js";

const COL      = "customers";
const PAGE_SZ  = 20;
const _cache   = new Map(); // small autocomplete cache

// ─── Read ──────────────────────────────────────────────────────────────────

export async function getCustomerById(id) {
  if (!isFirebaseConfigured() || !id) return null;
  const snap = await getDoc(doc(getDb(), COL, id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function getCustomersPaginated({ pageSize = PAGE_SZ, cursor = null } = {}) {
  if (!isFirebaseConfigured()) return { customers: [], lastDoc: null, hasMore: false };
  const db = getDb();
  let q = cursor
    ? query(collection(db, COL), orderBy("nameLower"), startAfter(cursor), limit(pageSize + 1))
    : query(collection(db, COL), orderBy("nameLower"), limit(pageSize + 1));
  const snap      = await getDocs(q);
  const docs      = snap.docs;
  const hasMore   = docs.length > pageSize;
  const customers = docs.slice(0, pageSize).map(d => ({ id: d.id, ...d.data() }));
  return { customers, lastDoc: customers.length ? docs[customers.length - 1] : null, hasMore };
}

export async function searchCustomers(namePrefix, maxResults = 10) {
  if (!isFirebaseConfigured() || !namePrefix) return [];
  const key = namePrefix.toLowerCase().trim();
  if (_cache.has(key)) return _cache.get(key);
  const term    = key;
  const termEnd = term + "\uf8ff";
  const db = getDb();
  const q  = query(collection(db, COL), where("nameLower", ">=", term), where("nameLower", "<=", termEnd), orderBy("nameLower"), limit(maxResults));
  const sn = await getDocs(q);
  const results = sn.docs.map(d => ({ id: d.id, ...d.data() }));
  if (_cache.size > 50) _cache.delete(_cache.keys().next().value);
  _cache.set(key, results);
  return results;
}

// ─── Upsert (used internally when saving a bill) ───────────────────────────

/**
 * Create or update a customer record when a bill is saved.
 * Matches by phone number first, then by name. Creates new if not found.
 * @param {{ name, phone, address }} data
 * @returns {Promise<string>} customer document ID
 */
export async function upsertCustomerFromBill({ name, phone, address = "" }) {
  if (!isFirebaseConfigured() || !name?.trim()) return null;
  const db   = getDb();
  const col  = collection(db, COL);
  const norm = name.trim();
  const ph   = (phone || "").trim();

  // Try to find existing customer by phone
  if (ph) {
    const q  = query(col, where("phone", "==", ph), limit(1));
    const sn = await getDocs(q);
    if (!sn.empty) {
      const existing = sn.docs[0];
      await updateDoc(existing.ref, {
        name:      norm,
        nameLower: norm.toLowerCase(),
        phone:     ph,
        updatedAt: serverTimestamp()
      });
      _cache.clear();
      return existing.id;
    }
  }

  // Try to find by name
  const q2  = query(col, where("nameLower", "==", norm.toLowerCase()), limit(1));
  const sn2 = await getDocs(q2);
  if (!sn2.empty) {
    const existing = sn2.docs[0];
    await updateDoc(existing.ref, {
      phone:     ph || existing.data().phone || "",
      updatedAt: serverTimestamp()
    });
    _cache.clear();
    return existing.id;
  }

  // Create new customer
  const newRef = doc(col);
  await setDoc(newRef, {
    name:           norm,
    nameLower:      norm.toLowerCase(),
    phone:          ph,
    address:        address.trim(),
    totalBills:     0,
    totalBillValue: 0,
    totalCommission:0,
    createdAt:      serverTimestamp(),
    updatedAt:      serverTimestamp()
  });
  _cache.clear();
  return newRef.id;
}

/**
 * Increment a customer's aggregate counters after a bill is saved.
 */
export async function incrementCustomerStats(customerId, { totalBill, totalCommission, quantityTons }) {
  if (!isFirebaseConfigured() || !customerId) return;
  try {
    await updateDoc(doc(getDb(), COL, customerId), {
      totalBills:      increment(1),
      totalBillValue:  increment(totalBill       || 0),
      totalCommission: increment(totalCommission || 0),
      updatedAt:       serverTimestamp()
    });
  } catch { /* non-critical */ }
}

// ─── Create / Update / Delete (manual from Customers page) ────────────────

export async function createCustomer({ name, phone = "", address = "" }) {
  if (!isFirebaseConfigured()) throw new Error("Firebase is not configured.");
  const db     = getDb();
  const norm   = (name || "").trim();
  if (!norm) throw new Error("Customer name is required.");
  const newRef = doc(collection(db, COL));
  await setDoc(newRef, {
    name:            norm,
    nameLower:       norm.toLowerCase(),
    phone:           (phone  || "").trim(),
    address:         (address|| "").trim(),
    totalBills:      0,
    totalBillValue:  0,
    totalCommission: 0,
    createdAt:       serverTimestamp(),
    updatedAt:       serverTimestamp()
  });
  _cache.clear();
  return { id: newRef.id, name: norm, phone, address };
}

export async function updateCustomer(customerId, { name, phone, address }) {
  if (!isFirebaseConfigured()) throw new Error("Firebase is not configured.");
  const norm = (name || "").trim();
  await updateDoc(doc(getDb(), COL, customerId), {
    name:      norm,
    nameLower: norm.toLowerCase(),
    phone:     (phone  || "").trim(),
    address:   (address|| "").trim(),
    updatedAt: serverTimestamp()
  });
  _cache.clear();
  return { id: customerId, name: norm, phone, address };
}

export async function deleteCustomer(customerId) {
  if (!isFirebaseConfigured()) throw new Error("Firebase is not configured.");
  await deleteDoc(doc(getDb(), COL, customerId));
  _cache.clear();
}

export async function getCustomerBills(customerId, cursor = null, pageSize = 20) {
  if (!isFirebaseConfigured() || !customerId) return { bills: [], lastDoc: null, hasMore: false };
  const db = getDb();
  let q = cursor
    ? query(collection(db, "bills"), where("customerId", "==", customerId), orderBy("billDateTs", "desc"), startAfter(cursor), limit(pageSize + 1))
    : query(collection(db, "bills"), where("customerId", "==", customerId), orderBy("billDateTs", "desc"), limit(pageSize + 1));
  const snap    = await getDocs(q);
  const docs    = snap.docs;
  const hasMore = docs.length > pageSize;
  const bills   = docs.slice(0, pageSize).map(d => ({ id: d.id, ...d.data() }));
  return { bills, lastDoc: bills.length ? docs[bills.length - 1] : null, hasMore };
}
