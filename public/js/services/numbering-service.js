/**
 * numbering-service.js
 * 
 * Provides idempotency key generation.
 * Actual bill number allocation happens atomically in the Cloud Function.
 */

/**
 * Generate a UUID v4 idempotency key.
 * This is sent with each bill creation request.
 * If the request is retried, the same key prevents a duplicate bill.
 * 
 * @returns {string} UUID v4
 */
export function generateIdempotencyKey() {
  // Use crypto.randomUUID if available (modern browsers)
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  // Fallback for older browsers
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Format a bill number from its numeric sequence and prefix.
 * e.g., prefix="BILL", number=42 → "BILL-0042"
 * 
 * @param {string} prefix
 * @param {number} number
 * @param {number} [padding=4] - Zero-padding digits
 * @returns {string}
 */
export function formatBillNumber(prefix, number, padding = 4) {
  const safe = String(prefix || "BILL").toUpperCase().replace(/[^A-Z0-9\-_]/g, "");
  const padded = String(number).padStart(padding, "0");
  return `${safe}-${padded}`;
}

/**
 * Parse a bill number into its prefix and numeric components.
 * e.g., "BILL-0042" → { prefix: "BILL", number: 42 }
 * Returns null if the format is not recognized.
 * 
 * @param {string} billNumber
 * @returns {{ prefix: string, number: number } | null}
 */
export function parseBillNumber(billNumber) {
  if (!billNumber) return null;
  const match = billNumber.match(/^([A-Z0-9\-_]+)-(\d+)$/i);
  if (!match) return null;
  return {
    prefix: match[1].toUpperCase(),
    number: parseInt(match[2], 10)
  };
}
