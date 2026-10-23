/**
 * bill-service.js
 *
 * Handles all bill CRUD operations.
 * Writes directly to Firestore (Cloud Functions optional).
 * Auto-creates/updates customer records on every bill save.
 */

import {
  collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc,
  query, orderBy, limit, startAfter,
  where, serverTimestamp, increment
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { getDb, isFirebaseConfigured } from "../firebase-init.js";
import { generateIdempotencyKey } from "./numbering-service.js";
import { upsertCustomerFromBill, incrementCustomerStats } from "./customer-service.js";

const BILLS_COL      = "bills";
const COUNTERS_DOC   = "counters/billNumber";
const AGG_DOC        = "dashboardAggregates/totals";
const PAGE_SIZE_DEF  = 20;

// ─── Create Bill ───────────────────────────────────────────────────────────

/**
 * Create a new bill — writes directly to Firestore.
 * No Cloud Functions needed.
 */
export async function createBill(billData, idempotencyKey) {
  if (!isFirebaseConfigured()) {
    throw new Error("Firebase is not configured. Please update firebase-config.js.");
  }
  return _createBillDirect(billData);
}

/**
 * Direct Firestore write fallback (no Cloud Function needed).
 * Used automatically when functions aren't deployed / on localhost.
 */
async function _createBillDirect(billData) {
  const db = getDb();

  // ── Bill number: localStorage-first (instant, never blocks save) ──────
  // Local counter persists across sessions. Firestore counter syncs in background.
  const prefix = _sanitizePrefix(billData.billPrefix || "BILL");
  let billNumber;
  try {
    const localKey = "jijubill-counter";
    const stored   = parseInt(localStorage.getItem(localKey) || "0", 10);
    const next     = (isNaN(stored) ? 0 : stored) + 1;
    localStorage.setItem(localKey, String(next));
    billNumber = `${prefix}-${String(next).padStart(4, "0")}`;

    // Sync Firestore counter in background (non-blocking)
    const counterRef = doc(db, COUNTERS_DOC);
    getDoc(counterRef).then(snap => {
      const fsCount = snap.exists() ? (snap.data().lastNumber || 0) : 0;
      const syncVal = Math.max(next, fsCount);
      return setDoc(counterRef, { lastNumber: syncVal, updatedAt: serverTimestamp() }, { merge: true });
    }).catch(() => {});
  } catch {
    billNumber = `${prefix}-${Date.now().toString().slice(-6)}`;
  }

  // ── Recalculate server-side to be safe ───────────────────────────────
  const tons     = Number(billData.quantityTons)       || 0;
  const rate     = Number(billData.ratePerQuintal)     || 0;
  const comm     = Number(billData.commissionPerQuintal) || 0;
  const quintals = Math.round(tons * 10 * 100) / 100;
  const totalBill       = Math.round(quintals * rate * 100) / 100;
  const totalCommission = Math.round(quintals * comm * 100) / 100;

  const billDate = billData.billDate || new Date().toISOString().slice(0, 10);
  const billRef  = doc(collection(db, BILLS_COL));

  const billDoc = {
    billNumber,
    billDate,
    billDateTs: new Date(billDate).getTime(),

    customerId:              billData.customerId              || null,
    customerNameSnapshot:    (billData.customerNameSnapshot || billData.customerName || "").trim(),
    customerNameLower:       (billData.customerNameSnapshot || billData.customerName || "").trim().toLowerCase(),
    customerPhoneSnapshot:   (billData.customerPhoneSnapshot || billData.customerPhone || "").trim(),
    customerAddressSnapshot: (billData.customerAddressSnapshot || "").trim(),

    particular:      (billData.particular || "").trim(),
    particularLower: (billData.particular || "").trim().toLowerCase(),

    quantityTons:     tons,
    quantityQuintals: quintals,
    ratePerQuintal:   rate,
    commissionPerQuintal: comm,
    totalBill,
    totalCommission,

    businessNameSnapshot:    (billData.businessNameSnapshot    || "").trim(),
    businessAddressSnapshot: (billData.businessAddressSnapshot || "").trim(),
    businessContactSnapshot: (billData.businessContactSnapshot || "").trim(),
    bankDetails:             (billData.bankDetails             || "").trim(),

    remarks:         (billData.remarks || "").trim(),
    templateVersion: 1,
    createdAt:       serverTimestamp(),
    updatedAt:       serverTimestamp(),
  };

  // ── Save bill to Firestore FIRST (this is the critical path) ────────────
  // Customer upsert and aggregates are best-effort and run in the background.
  await setDoc(billRef, billDoc);

  // ── Background: upsert customer + update stats (non-blocking) ────────
  const customerName    = billData.customerNameSnapshot || billData.customerName || "";
  const customerPhone   = billData.customerPhoneSnapshot || billData.customerPhone || "";
  const customerAddress = billData.customerAddressSnapshot || "";

  Promise.resolve().then(async () => {
    try {
      const resolvedCustomerId = await upsertCustomerFromBill({
        name:    customerName,
        phone:   customerPhone,
        address: customerAddress
      });
      if (resolvedCustomerId) {
        // Patch customerId onto the bill document now that we have it
        const { updateDoc } = await import("https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js");
        await updateDoc(billRef, { customerId: resolvedCustomerId }).catch(() => {});
        await incrementCustomerStats(resolvedCustomerId, { totalBill, totalCommission, quantityTons: tons }).catch(() => {});
      }
    } catch (e) {
      console.warn("[BillService] Background customer upsert failed:", e.message);
    }
  });

  // ── Background: update dashboard aggregates ───────────────────────────
  setDoc(doc(db, AGG_DOC), {
    totalBills:        increment(1),
    totalQuantityTons: increment(tons),
    totalBillValue:    increment(totalBill),
    totalCommission:   increment(totalCommission),
    lastUpdated:       serverTimestamp(),
  }, { merge: true }).catch(() => {});

  return { id: billRef.id, ...billDoc, createdAt: new Date().toISOString() };
}

// ─── Edit Bill ─────────────────────────────────────────────────────────────

export async function editBill(billId, updates) {
  if (!isFirebaseConfigured()) throw new Error("Firebase is not configured.");

  // Direct Firestore write — no Cloud Functions
  const db  = getDb();
  const ref = doc(db, BILLS_COL, billId);

  const tons     = Number(updates.quantityTons)         || 0;
  const rate     = Number(updates.ratePerQuintal)       || 0;
  const comm     = Number(updates.commissionPerQuintal) || 0;
  const quintals = Math.round(tons * 10 * 100) / 100;
  const totalBill       = Math.round(quintals * rate * 100) / 100;
  const totalCommission = Math.round(quintals * comm * 100) / 100;
  const billDate = updates.billDate || new Date().toISOString().slice(0, 10);

  const patch = {
    billDate,
    billDateTs: new Date(billDate).getTime(),
    customerNameSnapshot:   (updates.customerNameSnapshot || updates.customerName || "").trim(),
    customerNameLower:      (updates.customerNameSnapshot || updates.customerName || "").trim().toLowerCase(),
    customerPhoneSnapshot:  (updates.customerPhoneSnapshot || updates.customerPhone || "").trim(),
    particular:      (updates.particular || "").trim(),
    particularLower: (updates.particular || "").trim().toLowerCase(),
    quantityTons: tons, quantityQuintals: quintals,
    ratePerQuintal: rate, commissionPerQuintal: comm,
    totalBill, totalCommission,
    remarks:   (updates.remarks || "").trim(),
    updatedAt: serverTimestamp(),
  };

  await updateDoc(ref, patch);
  return { id: billId, ...patch };
}

// ─── Delete Bill ───────────────────────────────────────────────────────────

export async function deleteBill(billId) {
  if (!isFirebaseConfigured()) throw new Error("Firebase is not configured.");

  const db   = getDb();
  const ref  = doc(db, BILLS_COL, billId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;

  const bill = snap.data();
  await deleteDoc(ref);

  // Reverse aggregates best-effort
  try {
    await setDoc(doc(db, AGG_DOC), {
      totalBills:        increment(-1),
      totalQuantityTons: increment(-(bill.quantityTons || 0)),
      totalBillValue:    increment(-(bill.totalBill || 0)),
      totalCommission:   increment(-(bill.totalCommission || 0)),
      lastUpdated:       serverTimestamp(),
    }, { merge: true });
  } catch { /* non-critical */ }
}

// ─── Read Operations ───────────────────────────────────────────────────────

export async function getBillById(billId) {
  if (!isFirebaseConfigured()) return null;
  const db   = getDb();
  const snap = await getDoc(doc(db, BILLS_COL, billId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

export async function getBillsPaginated(options = {}) {
  if (!isFirebaseConfigured()) return { bills: [], lastDoc: null, hasMore: false };
  const { pageSize = PAGE_SIZE_DEF, cursor = null } = options;
  const db     = getDb();
  const colRef = collection(db, BILLS_COL);
  let q = cursor
    ? query(colRef, orderBy("billDateTs", "desc"), startAfter(cursor), limit(pageSize + 1))
    : query(colRef, orderBy("billDateTs", "desc"), limit(pageSize + 1));
  const snap    = await getDocs(q);
  const docs    = snap.docs;
  const hasMore = docs.length > pageSize;
  const bills   = docs.slice(0, pageSize).map(d => ({ id: d.id, ...d.data() }));
  const lastDoc = bills.length > 0 ? docs[bills.length - 1] : null;
  return { bills, lastDoc, hasMore };
}

export async function searchByBillNumber(billNumber) {
  if (!isFirebaseConfigured() || !billNumber) return [];
  const db = getDb();
  const q  = query(collection(db, BILLS_COL), where("billNumber", "==", billNumber.trim().toUpperCase()), limit(5));
  const sn = await getDocs(q);
  return sn.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function searchByCustomerName(namePrefix, maxResults = 20) {
  if (!isFirebaseConfigured() || !namePrefix) return [];
  const term    = namePrefix.trim().toLowerCase();
  const termEnd = term + "\uf8ff";
  const db = getDb();
  const q  = query(collection(db, BILLS_COL), where("customerNameLower", ">=", term), where("customerNameLower", "<=", termEnd), orderBy("customerNameLower"), limit(maxResults));
  const sn = await getDocs(q);
  return sn.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function searchByPhone(phone, maxResults = 20) {
  if (!isFirebaseConfigured() || !phone) return [];
  const db = getDb();
  const q  = query(collection(db, BILLS_COL), where("customerPhoneSnapshot", "==", phone.trim()), orderBy("billDateTs", "desc"), limit(maxResults));
  const sn = await getDocs(q);
  return sn.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function searchByDateRange(startDate, endDate, cursor = null, pageSize = 20) {
  if (!isFirebaseConfigured()) return { bills: [], lastDoc: null, hasMore: false };
  const startTs = new Date(startDate).getTime();
  const endTs   = new Date(endDate + "T23:59:59").getTime();
  const db      = getDb();
  const base    = [collection(db, BILLS_COL), where("billDateTs", ">=", startTs), where("billDateTs", "<=", endTs), orderBy("billDateTs", "desc")];
  let q = cursor
    ? query(...base, startAfter(cursor), limit(pageSize + 1))
    : query(...base, limit(pageSize + 1));
  const snap    = await getDocs(q);
  const docs    = snap.docs;
  const hasMore = docs.length > pageSize;
  const bills   = docs.slice(0, pageSize).map(d => ({ id: d.id, ...d.data() }));
  return { bills, lastDoc: bills.length > 0 ? docs[bills.length - 1] : null, hasMore };
}

export async function getRecentBills(count = 5) {
  if (!isFirebaseConfigured()) return [];
  const db = getDb();
  const q  = query(collection(db, BILLS_COL), orderBy("billDateTs", "desc"), limit(count));
  const sn = await getDocs(q);
  return sn.docs.map(d => ({ id: d.id, ...d.data() }));
}

export function newIdempotencyKey() { return generateIdempotencyKey(); }

// ─── Internal helpers ──────────────────────────────────────────────────────
function _sanitizePrefix(raw) {
  return String(raw || "BILL").toUpperCase().replace(/[^A-Z0-9\-_]/g, "").slice(0, 10) || "BILL";
}
