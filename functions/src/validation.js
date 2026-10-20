/**
 * functions/src/validation.js
 * 
 * Server-side validation helpers.
 * Mirrors client validation but is the authoritative source of truth.
 * All values are re-validated on the server regardless of client state.
 */

/**
 * Validate bill input data on the server.
 * @param {object} data
 * @returns {{ valid: boolean, errors: object }}
 */
function validateBill(data) {
  const errors = {};

  if (!data.billDate || !/^\d{4}-\d{2}-\d{2}$/.test(data.billDate)) {
    errors.billDate = "Bill date must be in YYYY-MM-DD format";
  } else {
    const d = new Date(data.billDate);
    const now = new Date();
    now.setFullYear(now.getFullYear() + 1);
    if (isNaN(d.getTime())) errors.billDate = "Invalid date";
    else if (d > now) errors.billDate = "Bill date cannot be more than 1 year in the future";
    else if (d < new Date("2000-01-01")) errors.billDate = "Bill date is too far in the past";
  }

  const name = safeStr(data.customerNameSnapshot || data.customerName);
  if (!name) errors.customerName = "Customer name is required";
  else if (name.length < 2) errors.customerName = "Customer name must be at least 2 characters";
  else if (name.length > 200) errors.customerName = "Customer name must be 200 characters or less";

  if (!data.particular || safeStr(data.particular).length < 1) {
    errors.particular = "Particular is required";
  } else if (safeStr(data.particular).length > 300) {
    errors.particular = "Particular must be 300 characters or less";
  }

  const qty = Number(data.quantityTons);
  if (isNaN(qty) || qty <= 0) errors.quantityTons = "Quantity must be a positive number";
  else if (qty > 100000) errors.quantityTons = "Quantity seems too large (max 100,000 tons)";

  const rate = Number(data.ratePerQuintal);
  if (isNaN(rate) || rate < 0) errors.ratePerQuintal = "Rate must be zero or positive";
  else if (rate > 10000000) errors.ratePerQuintal = "Rate seems unreasonably large";

  const comm = Number(data.commissionPerQuintal);
  if (isNaN(comm) || comm < 0) errors.commissionPerQuintal = "Commission must be zero or positive";
  else if (comm > 100000) errors.commissionPerQuintal = "Commission seems unreasonably large";

  const phone = safeStr(data.customerPhoneSnapshot || data.customerPhone);
  if (phone) {
    const digits = phone.replace(/\D/g, "");
    if (digits.length < 7 || digits.length > 15) {
      errors.customerPhone = "Phone number must be 7–15 digits";
    }
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors
  };
}

/**
 * Validate customer input data.
 * @param {object} data
 * @returns {{ valid: boolean, errors: object }}
 */
function validateCustomer(data) {
  const errors = {};

  const name = safeStr(data.name);
  if (!name) errors.name = "Customer name is required";
  else if (name.length < 2) errors.name = "Name must be at least 2 characters";
  else if (name.length > 200) errors.name = "Name must be 200 characters or less";

  if (data.phone) {
    const digits = safeStr(data.phone).replace(/\D/g, "");
    if (digits.length > 0 && (digits.length < 7 || digits.length > 15)) {
      errors.phone = "Phone must be 7–15 digits";
    }
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors
  };
}

/**
 * Authoritative bill calculation — MUST match client-side bill-calculator.js.
 * Never use client-submitted totals; always recalculate on the server.
 * 
 * @param {number} quantityTons
 * @param {number} ratePerQuintal
 * @param {number} commissionPerQuintal
 * @returns {{ quantityQuintals: number, totalBill: number, totalCommission: number }}
 */
function recalculate(quantityTons, ratePerQuintal, commissionPerQuintal) {
  const tons  = Number(quantityTons);
  const rate  = Number(ratePerQuintal);
  const comm  = Number(commissionPerQuintal);

  // 1 ton = 10 quintals (exact, never approximate)
  const quintals = roundFinancial(tons * 10);

  // Total Bill = quintals × rate  (commission is SEPARATE — NEVER added)
  const totalBill       = roundFinancial(quintals * rate);
  const totalCommission = roundFinancial(quintals * comm);

  return { quantityQuintals: quintals, totalBill, totalCommission };
}

/**
 * Round to 2 decimal places using "round half away from zero" (banker-safe).
 * Same algorithm as the client-side roundFinancial().
 */
function roundFinancial(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Safe string trim.
 */
function safeStr(val) {
  if (val === null || val === undefined) return "";
  return String(val).trim();
}

module.exports = { validateBill, validateCustomer, recalculate, safeStr };
