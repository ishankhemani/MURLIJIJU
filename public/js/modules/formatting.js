/**
 * formatting.js
 * 
 * Indian currency and number formatting utilities.
 * All formatting is done locally — no network requests.
 */

// ─── Indian Number System ───────────────────────────────────────────────────

/**
 * Format a number in Indian currency format.
 * e.g., 1250000 → "₹12,50,000.00"
 * 
 * @param {number} amount - The amount to format
 * @param {boolean} [showDecimals=true] - Whether to show decimal places
 * @returns {string} Formatted currency string
 */
export function formatCurrency(amount, showDecimals = true) {
  if (amount === null || amount === undefined || isNaN(amount)) return "₹0.00";

  const num = Math.abs(Number(amount));
  const isNegative = Number(amount) < 0;

  // Use Intl.NumberFormat for Indian locale
  const formatter = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: showDecimals ? 2 : 0,
    maximumFractionDigits: showDecimals ? 2 : 0
  });

  const formatted = formatter.format(num);
  return isNegative ? `-${formatted}` : formatted;
}

/**
 * Format a number in Indian system (with commas) without currency symbol.
 * e.g., 1250000 → "12,50,000"
 * 
 * @param {number} num
 * @param {number} [decimals=2]
 * @returns {string}
 */
export function formatNumber(num, decimals = 2) {
  if (num === null || num === undefined || isNaN(num)) return "0";

  return new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  }).format(Number(num));
}

/**
 * Format quantity with up to 3 decimal places, trimming trailing zeros.
 * e.g., 25.000 → "25", 25.500 → "25.5"
 * 
 * @param {number} qty
 * @returns {string}
 */
export function formatQuantity(qty) {
  if (qty === null || qty === undefined || isNaN(qty)) return "0";
  const n = Number(qty);
  // Remove trailing zeros
  return new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3
  }).format(n);
}

/**
 * Parse a currency string to a number.
 * Handles "₹12,50,000.00" → 1250000
 * 
 * @param {string} str
 * @returns {number}
 */
export function parseCurrency(str) {
  if (!str) return 0;
  const cleaned = String(str).replace(/[₹,\s]/g, "");
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}

// ─── Date Formatting ───────────────────────────────────────────────────────

/**
 * Format a date string or Date object for display.
 * e.g., "2026-10-20" → "20 Oct 2026"
 * 
 * @param {string|Date|number} date
 * @returns {string}
 */
export function formatDate(date) {
  if (!date) return "";
  let d;
  if (date && date.toDate) d = date.toDate(); // Firestore Timestamp
  else if (date instanceof Date) d = date;
  else d = new Date(date);

  if (isNaN(d.getTime())) return String(date);

  return d.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
}

/**
 * Format date for HTML date input (YYYY-MM-DD).
 * 
 * @param {Date|string} date
 * @returns {string}
 */
export function formatDateInput(date) {
  if (!date) return "";
  let d;
  if (date && date.toDate) d = date.toDate();
  else if (date instanceof Date) d = date;
  else d = new Date(date);
  if (isNaN(d.getTime())) return "";

  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Get today's date as YYYY-MM-DD string (local time).
 * @returns {string}
 */
export function todayInputDate() {
  return formatDateInput(new Date());
}

/**
 * Format a Firestore timestamp or Date as a relative time.
 * e.g., "2 hours ago", "just now"
 * 
 * @param {Date|object} date
 * @returns {string}
 */
export function formatRelativeTime(date) {
  if (!date) return "";
  let d;
  if (date && date.toDate) d = date.toDate();
  else if (date instanceof Date) d = date;
  else d = new Date(date);

  const now = new Date();
  const diffMs = now - d;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr  = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffSec < 60)  return "just now";
  if (diffMin < 60)  return `${diffMin}m ago`;
  if (diffHr < 24)   return `${diffHr}h ago`;
  if (diffDay < 7)   return `${diffDay}d ago`;
  return formatDate(d);
}

// ─── Phone Formatting ──────────────────────────────────────────────────────

/**
 * Format phone number for WhatsApp (international format, no +).
 * Handles Indian numbers: removes leading 0 and adds 91.
 * 
 * @param {string} phone
 * @returns {string} Phone number for wa.me link
 */
export function formatPhoneForWhatsApp(phone) {
  if (!phone) return "";
  let cleaned = phone.replace(/[\s\-\(\)\.]/g, "");
  // Remove leading +
  if (cleaned.startsWith("+")) cleaned = cleaned.slice(1);
  // Indian number starting with 0
  if (cleaned.startsWith("0") && cleaned.length === 11) {
    cleaned = "91" + cleaned.slice(1);
  }
  // Indian number, 10 digits
  if (/^[6-9]\d{9}$/.test(cleaned)) {
    cleaned = "91" + cleaned;
  }
  return cleaned;
}

/**
 * Display a phone number nicely.
 * @param {string} phone
 * @returns {string}
 */
export function displayPhone(phone) {
  if (!phone) return "";
  return phone;
}

// ─── String Utilities ─────────────────────────────────────────────────────

/**
 * Safely convert to string and trim.
 * @param {*} val
 * @returns {string}
 */
export function safeStr(val) {
  return val != null ? String(val).trim() : "";
}

/**
 * Capitalize first letter of each word.
 * @param {string} str
 * @returns {string}
 */
export function titleCase(str) {
  return str.toLowerCase().replace(/\b\w/g, l => l.toUpperCase());
}

/**
 * Get initials from a name (up to 2 chars).
 * e.g., "Rahul Traders" → "RT"
 * @param {string} name
 * @returns {string}
 */
export function getInitials(name) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

/**
 * Generate a safe filename from a bill number and customer name.
 * e.g., ("BILL-0001", "Rahul Traders") → "BILL-0001_Rahul-Traders"
 * @param {string} billNumber
 * @param {string} customerName
 * @returns {string}
 */
export function generateFileName(billNumber, customerName) {
  const safeBill = billNumber.replace(/[^A-Za-z0-9\-]/g, "");
  const safeName = customerName.trim().replace(/\s+/g, "-").replace(/[^A-Za-z0-9\-]/g, "");
  return `${safeBill}_${safeName}`;
}
