/**
 * dashboard-service.js
 * 
 * Loads dashboard aggregates from Firestore.
 * Uses pre-computed aggregate documents maintained by Cloud Functions
 * to avoid fetching and summing thousands of bill documents.
 */

import {
  doc, getDoc, collection, query,
  orderBy, limit, getDocs, where
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { getDb, isFirebaseConfigured } from "../firebase-init.js";

const AGGREGATES_DOC = "totals";
const AGGREGATES_COL = "dashboardAggregates";

// ─── Global Totals ─────────────────────────────────────────────────────────

/**
 * Get overall totals from the pre-computed aggregate document.
 * The aggregate is updated by Cloud Functions on every bill create/edit/delete.
 * 
 * @returns {Promise<object>}
 */
export async function getGlobalTotals() {
  if (!isFirebaseConfigured()) {
    return {
      totalBills: 0,
      totalQuantityTons: 0,
      totalBillValue: 0,
      totalCommission: 0,
      lastUpdated: null
    };
  }

  const db   = getDb();
  const ref  = doc(db, AGGREGATES_COL, AGGREGATES_DOC);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    return {
      totalBills: 0,
      totalQuantityTons: 0,
      totalBillValue: 0,
      totalCommission: 0,
      lastUpdated: null
    };
  }

  return snap.data();
}

/**
 * Get statistics for a specific date range.
 * For small-to-medium datasets: fetches all bills in range and aggregates client-side.
 * For production with large datasets: implement a server-side aggregation function.
 * 
 * NOTE: This fetches at most 1000 bills for the range. For larger ranges,
 * use the pre-computed monthly aggregates instead.
 * 
 * @param {string} startDate - YYYY-MM-DD
 * @param {string} endDate   - YYYY-MM-DD
 * @returns {Promise<object>}
 */
export async function getDateRangeTotals(startDate, endDate) {
  if (!isFirebaseConfigured()) {
    return { totalBills: 0, totalQuantityTons: 0, totalBillValue: 0, totalCommission: 0 };
  }

  const startTs = new Date(startDate).getTime();
  const endTs   = new Date(endDate + "T23:59:59").getTime();

  const db = getDb();
  const q  = query(
    collection(db, "bills"),
    where("billDateTs", ">=", startTs),
    where("billDateTs", "<=", endTs),
    orderBy("billDateTs", "desc"),
    limit(1000)
  );

  const snap = await getDocs(q);
  let totalBills = 0, totalQuantityTons = 0, totalBillValue = 0, totalCommission = 0;

  snap.forEach(d => {
    const data = d.data();
    totalBills++;
    totalQuantityTons += Number(data.quantityTons || 0);
    totalBillValue    += Number(data.totalBill    || 0);
    totalCommission   += Number(data.totalCommission || 0);
  });

  return {
    totalBills,
    totalQuantityTons: Math.round(totalQuantityTons * 1000) / 1000,
    totalBillValue:    Math.round(totalBillValue    * 100)  / 100,
    totalCommission:   Math.round(totalCommission   * 100)  / 100
  };
}

/**
 * Get monthly aggregates for the past N months.
 * @param {number} [months=6]
 * @returns {Promise<object[]>} Array of monthly totals sorted by month desc
 */
export async function getMonthlyTrend(months = 6) {
  if (!isFirebaseConfigured()) return [];

  const results = [];
  const now = new Date();
  const db  = getDb();

  for (let i = 0; i < months; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const y = d.getFullYear();
    const m = d.getMonth(); // 0-indexed

    const startTs = new Date(y, m, 1).getTime();
    const endTs   = new Date(y, m + 1, 0, 23, 59, 59).getTime();

    const q = query(
      collection(db, "bills"),
      where("billDateTs", ">=", startTs),
      where("billDateTs", "<=", endTs),
      orderBy("billDateTs"),
      limit(500)
    );

    try {
      const snap = await getDocs(q);
      let totalBills = 0, totalBillValue = 0, totalCommission = 0;
      snap.forEach(doc => {
        const data = doc.data();
        totalBills++;
        totalBillValue  += Number(data.totalBill        || 0);
        totalCommission += Number(data.totalCommission  || 0);
      });
      results.push({
        year:  y,
        month: m + 1,
        label: d.toLocaleDateString("en-IN", { month: "short", year: "numeric" }),
        totalBills,
        totalBillValue:    Math.round(totalBillValue    * 100) / 100,
        totalCommission:   Math.round(totalCommission   * 100) / 100
      });
    } catch (err) {
      console.warn(`[Dashboard] Failed to get month ${y}-${m+1}:`, err);
    }
  }

  return results.reverse(); // Oldest first
}

/**
 * Get top customers by bill value.
 * @param {number} [limit=5]
 * @returns {Promise<object[]>}
 */
export async function getTopCustomers(topLimit = 5) {
  if (!isFirebaseConfigured()) return [];

  const db = getDb();
  const q  = query(
    collection(db, "customers"),
    orderBy("totalBillValue", "desc"),
    limit(topLimit)
  );

  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
