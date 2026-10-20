/**
 * functions/src/bill-operations.js
 * 
 * All bill and customer write operations exposed as HTTPS callable functions.
 * 
 * Security model:
 * - App Check enforced on all functions (rejects requests without valid tokens)
 * - Server-side re-validation of ALL fields
 * - Server-side re-calculation of ALL financials (client totals are IGNORED)
 * - Atomic bill number allocation using Firestore transactions
 * - Idempotency via idempotency keys (prevents duplicate bills on retry)
 * - Aggregate counter maintained atomically with FieldValue.increment
 * - Bill numbers are NEVER reused, even after deletion
 */

const admin     = require("firebase-admin");
const functions = require("firebase-functions");
const { validateBill, validateCustomer, recalculate, safeStr } = require("./validation.js");

const db = admin.firestore();

// ─── Constants ──────────────────────────────────────────────────────────────
const BILLS_COL         = "bills";
const CUSTOMERS_COL     = "customers";
const COUNTERS_DOC      = "counters/billNumber";
const AGGREGATES_DOC    = "dashboardAggregates/totals";
const IDEMPOTENCY_COL   = "idempotencyKeys";
const IDEMPOTENCY_TTL   = 24 * 60 * 60 * 1000; // 24 hours in ms
const MAX_BILL_AGE_DAYS = 365;

// ─── createBill ─────────────────────────────────────────────────────────────
exports.createBill = functions
  .runWith({ enforceAppCheck: true })
  .https.onCall(async (data, context) => {

    // 1. Validate input
    const { valid, errors } = validateBill(data);
    if (!valid) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Bill validation failed: " + Object.values(errors).join("; "),
        errors
      );
    }

    // 2. Check idempotency key
    const idempotencyKey = safeStr(data.idempotencyKey);
    if (!idempotencyKey || !/^[0-9a-f-]{36}$/.test(idempotencyKey)) {
      throw new functions.https.HttpsError("invalid-argument", "Valid idempotency key required");
    }

    const idempotencyRef = db.collection(IDEMPOTENCY_COL).doc(idempotencyKey);
    const existingIdem   = await idempotencyRef.get();

    if (existingIdem.exists) {
      // Already processed — return the saved bill (safe to retry)
      const savedBillId = existingIdem.data().billId;
      const savedBill   = await db.collection(BILLS_COL).doc(savedBillId).get();
      if (savedBill.exists) {
        return { success: true, bill: { id: savedBillId, ...savedBill.data() }, idempotent: true };
      }
    }

    // 3. Server-side recalculation — IGNORE client totals entirely
    const { quantityQuintals, totalBill, totalCommission } = recalculate(
      data.quantityTons,
      data.ratePerQuintal,
      data.commissionPerQuintal
    );

    // 4. Get settings for prefix (from Firestore settings doc)
    const settingsSnap = await db.doc("settings/business").get();
    const settings = settingsSnap.exists ? settingsSnap.data() : {};
    const prefix   = sanitizePrefix(settings.billPrefix || "BILL");

    // 5. Allocate bill number atomically
    const billNumber = await allocateBillNumber(db, prefix);

    // 6. Write bill document
    const billDate = safeStr(data.billDate);
    const billRef  = db.collection(BILLS_COL).doc();

    const billDoc = {
      billNumber,
      billDate,
      billDateTs: new Date(billDate).getTime(),

      // Customer fields
      customerId:              safeStr(data.customerId) || null,
      customerNameSnapshot:    safeStr(data.customerNameSnapshot || data.customerName),
      customerNameLower:       safeStr(data.customerNameSnapshot || data.customerName).toLowerCase(),
      customerPhoneSnapshot:   safeStr(data.customerPhoneSnapshot || data.customerPhone),

      // Commodity
      particular:       safeStr(data.particular),
      particularLower:  safeStr(data.particular).toLowerCase(),

      // Quantities
      quantityTons:     Number(data.quantityTons),
      quantityQuintals,

      // Rates
      ratePerQuintal:         Number(data.ratePerQuintal),
      commissionPerQuintal:   Number(data.commissionPerQuintal),

      // Server-calculated totals (authoritative)
      totalBill,
      totalCommission,

      // Business snapshots
      businessNameSnapshot:    safeStr(data.businessNameSnapshot),
      businessAddressSnapshot: safeStr(data.businessAddressSnapshot),
      businessContactSnapshot: safeStr(data.businessContactSnapshot),

      // Metadata
      remarks:         safeStr(data.remarks),
      templateVersion: 1,
      createdAt:       admin.firestore.FieldValue.serverTimestamp(),
      updatedAt:       admin.firestore.FieldValue.serverTimestamp(),
    };

    const batch = db.batch();

    // Write bill
    batch.set(billRef, billDoc);

    // Write idempotency key record (expires after 24h)
    batch.set(idempotencyRef, {
      billId:    billRef.id,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      expiresAt: Date.now() + IDEMPOTENCY_TTL
    });

    // Update dashboard aggregates
    batch.set(db.doc(AGGREGATES_DOC), {
      totalBills:         admin.firestore.FieldValue.increment(1),
      totalQuantityTons:  admin.firestore.FieldValue.increment(Number(data.quantityTons)),
      totalBillValue:     admin.firestore.FieldValue.increment(totalBill),
      totalCommission:    admin.firestore.FieldValue.increment(totalCommission),
      lastUpdated:        admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    // Update customer aggregate if customerId is provided
    if (data.customerId) {
      const custRef = db.collection(CUSTOMERS_COL).doc(safeStr(data.customerId));
      batch.set(custRef, {
        totalBills:         admin.firestore.FieldValue.increment(1),
        totalQuantityTons:  admin.firestore.FieldValue.increment(Number(data.quantityTons)),
        totalBillValue:     admin.firestore.FieldValue.increment(totalBill),
        totalCommission:    admin.firestore.FieldValue.increment(totalCommission),
        lastBillAt:         admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
    }

    await batch.commit();

    return {
      success: true,
      bill:    { id: billRef.id, ...billDoc, createdAt: new Date().toISOString() }
    };
  });

// ─── editBill ────────────────────────────────────────────────────────────────
exports.editBill = functions
  .runWith({ enforceAppCheck: true })
  .https.onCall(async (data, context) => {

    const billId = safeStr(data.billId);
    if (!billId) throw new functions.https.HttpsError("invalid-argument", "billId is required");

    // Validate input
    const { valid, errors } = validateBill(data);
    if (!valid) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Validation failed: " + Object.values(errors).join("; "),
        errors
      );
    }

    // Verify bill exists
    const billRef  = db.collection(BILLS_COL).doc(billId);
    const billSnap = await billRef.get();
    if (!billSnap.exists) {
      throw new functions.https.HttpsError("not-found", "Bill not found");
    }

    const oldBill = billSnap.data();

    // Server-side recalculation
    const { quantityQuintals, totalBill, totalCommission } = recalculate(
      data.quantityTons,
      data.ratePerQuintal,
      data.commissionPerQuintal
    );

    const billDate = safeStr(data.billDate);

    const updates = {
      billDate,
      billDateTs: new Date(billDate).getTime(),
      customerNameSnapshot:  safeStr(data.customerNameSnapshot || data.customerName),
      customerNameLower:     safeStr(data.customerNameSnapshot || data.customerName).toLowerCase(),
      customerPhoneSnapshot: safeStr(data.customerPhoneSnapshot || data.customerPhone),
      particular:      safeStr(data.particular),
      particularLower: safeStr(data.particular).toLowerCase(),
      quantityTons:    Number(data.quantityTons),
      quantityQuintals,
      ratePerQuintal:       Number(data.ratePerQuintal),
      commissionPerQuintal: Number(data.commissionPerQuintal),
      totalBill,
      totalCommission,
      businessNameSnapshot:    safeStr(data.businessNameSnapshot),
      businessAddressSnapshot: safeStr(data.businessAddressSnapshot),
      businessContactSnapshot: safeStr(data.businessContactSnapshot),
      remarks:    safeStr(data.remarks),
      updatedAt:  admin.firestore.FieldValue.serverTimestamp(),
    };

    const batch = db.batch();
    batch.update(billRef, updates);

    // Update dashboard aggregates with delta
    const billDelta = totalBill       - (oldBill.totalBill       || 0);
    const commDelta = totalCommission - (oldBill.totalCommission  || 0);
    const qtyDelta  = Number(data.quantityTons) - (oldBill.quantityTons || 0);

    if (billDelta !== 0 || commDelta !== 0 || qtyDelta !== 0) {
      batch.set(db.doc(AGGREGATES_DOC), {
        totalQuantityTons: admin.firestore.FieldValue.increment(qtyDelta),
        totalBillValue:    admin.firestore.FieldValue.increment(billDelta),
        totalCommission:   admin.firestore.FieldValue.increment(commDelta),
        lastUpdated:       admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
    }

    await batch.commit();

    return {
      success: true,
      bill: { id: billId, ...oldBill, ...updates, updatedAt: new Date().toISOString() }
    };
  });

// ─── deleteBill ─────────────────────────────────────────────────────────────
exports.deleteBill = functions
  .runWith({ enforceAppCheck: true })
  .https.onCall(async (data, context) => {

    const billId = safeStr(data.billId);
    if (!billId) throw new functions.https.HttpsError("invalid-argument", "billId is required");

    const billRef  = db.collection(BILLS_COL).doc(billId);
    const billSnap = await billRef.get();
    if (!billSnap.exists) throw new functions.https.HttpsError("not-found", "Bill not found");

    const bill = billSnap.data();

    const batch = db.batch();
    batch.delete(billRef);

    // Reverse aggregates
    batch.set(db.doc(AGGREGATES_DOC), {
      totalBills:         admin.firestore.FieldValue.increment(-1),
      totalQuantityTons:  admin.firestore.FieldValue.increment(-(bill.quantityTons || 0)),
      totalBillValue:     admin.firestore.FieldValue.increment(-(bill.totalBill || 0)),
      totalCommission:    admin.firestore.FieldValue.increment(-(bill.totalCommission || 0)),
      lastUpdated:        admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    // Reverse customer aggregate
    if (bill.customerId) {
      const custRef = db.collection(CUSTOMERS_COL).doc(bill.customerId);
      batch.set(custRef, {
        totalBills:         admin.firestore.FieldValue.increment(-1),
        totalQuantityTons:  admin.firestore.FieldValue.increment(-(bill.quantityTons || 0)),
        totalBillValue:     admin.firestore.FieldValue.increment(-(bill.totalBill || 0)),
        totalCommission:    admin.firestore.FieldValue.increment(-(bill.totalCommission || 0)),
      }, { merge: true });
    }

    await batch.commit();
    return { success: true };
  });

// ─── createCustomer ──────────────────────────────────────────────────────────
exports.createCustomer = functions
  .runWith({ enforceAppCheck: true })
  .https.onCall(async (data, context) => {

    const { valid, errors } = validateCustomer(data);
    if (!valid) throw new functions.https.HttpsError("invalid-argument", "Validation failed", errors);

    const custRef = db.collection(CUSTOMERS_COL).doc();
    const custDoc = {
      name:       safeStr(data.name),
      nameLower:  safeStr(data.name).toLowerCase(),
      phone:      safeStr(data.phone),
      address:    safeStr(data.address),
      notes:      safeStr(data.notes),
      totalBills:        0,
      totalQuantityTons: 0,
      totalBillValue:    0,
      totalCommission:   0,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    await custRef.set(custDoc);
    return { success: true, customer: { id: custRef.id, ...custDoc } };
  });

// ─── updateCustomer ──────────────────────────────────────────────────────────
exports.updateCustomer = functions
  .runWith({ enforceAppCheck: true })
  .https.onCall(async (data, context) => {

    const customerId = safeStr(data.customerId);
    if (!customerId) throw new functions.https.HttpsError("invalid-argument", "customerId is required");

    const { valid, errors } = validateCustomer(data);
    if (!valid) throw new functions.https.HttpsError("invalid-argument", "Validation failed", errors);

    const custRef = db.collection(CUSTOMERS_COL).doc(customerId);
    if (!(await custRef.get()).exists) throw new functions.https.HttpsError("not-found", "Customer not found");

    const updates = {
      name:      safeStr(data.name),
      nameLower: safeStr(data.name).toLowerCase(),
      phone:     safeStr(data.phone),
      address:   safeStr(data.address),
      notes:     safeStr(data.notes),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    await custRef.update(updates);
    return { success: true, customer: { id: customerId, ...updates } };
  });

// ─── deleteCustomer ──────────────────────────────────────────────────────────
exports.deleteCustomer = functions
  .runWith({ enforceAppCheck: true })
  .https.onCall(async (data, context) => {

    const customerId = safeStr(data.customerId);
    if (!customerId) throw new functions.https.HttpsError("invalid-argument", "customerId is required");

    const custRef = db.collection(CUSTOMERS_COL).doc(customerId);
    if (!(await custRef.get()).exists) throw new functions.https.HttpsError("not-found", "Customer not found");

    // Note: bills are NOT deleted. Their customerNameSnapshot is preserved.
    await custRef.delete();
    return { success: true };
  });

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Atomically allocate the next bill number using a Firestore counter.
 * Uses a transaction to prevent race conditions.
 * Bill numbers are NEVER reused.
 * 
 * @param {FirebaseFirestore.Firestore} db
 * @param {string} prefix
 * @returns {Promise<string>} e.g., "BILL-0042"
 */
async function allocateBillNumber(db, prefix) {
  const counterRef = db.doc(COUNTERS_DOC);
  let newNumber;

  await db.runTransaction(async (txn) => {
    const snap = await txn.get(counterRef);
    const current = snap.exists ? (snap.data().lastNumber || 0) : 0;
    newNumber = current + 1;
    txn.set(counterRef, {
      lastNumber: newNumber,
      lastPrefix: prefix,
      updatedAt:  admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
  });

  return `${prefix}-${String(newNumber).padStart(4, "0")}`;
}

/**
 * Sanitize bill number prefix — allow only alphanumeric, hyphen, underscore.
 */
function sanitizePrefix(raw) {
  return String(raw || "BILL")
    .toUpperCase()
    .replace(/[^A-Z0-9\-_]/g, "")
    .slice(0, 10) || "BILL";
}
