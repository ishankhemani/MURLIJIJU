/**
 * validation.js
 * 
 * Client-side validation for bill forms and other inputs.
 * Server-side validation in Cloud Functions mirrors these rules.
 */

import { safeStr } from "./formatting.js";

// ─── Bill Validation ────────────────────────────────────────────────────────

/**
 * Validate a complete bill form data object.
 * Returns { valid: boolean, errors: Record<string, string> }
 * 
 * @param {object} data
 * @returns {{ valid: boolean, errors: Record<string, string> }}
 */
export function validateBillForm(data) {
  const errors = {};

  // Bill Date
  if (!data.billDate || !isValidDate(data.billDate)) {
    errors.billDate = "Please enter a valid bill date";
  }

  // Customer Name
  const customerName = safeStr(data.customerName);
  if (!customerName) {
    errors.customerName = "Customer name is required";
  } else if (customerName.length < 2) {
    errors.customerName = "Customer name must be at least 2 characters";
  } else if (customerName.length > 200) {
    errors.customerName = "Customer name is too long";
  }

  // Particular
  const particular = safeStr(data.particular);
  if (!particular) {
    errors.particular = "Particular / commodity is required";
  } else if (particular.length > 200) {
    errors.particular = "Particular is too long";
  }

  // Quantity in Tons
  const qtyValidation = validatePositiveNumber(data.quantityTons, "Quantity");
  if (qtyValidation) errors.quantityTons = qtyValidation;

  // Rate per Quintal
  const rateValidation = validateNonNegativeNumber(data.ratePerQuintal, "Rate");
  if (rateValidation) errors.ratePerQuintal = rateValidation;

  // Commission per Quintal
  const commValidation = validateNonNegativeNumber(data.commissionPerQuintal, "Commission");
  if (commValidation) errors.commissionPerQuintal = commValidation;

  // Phone (optional) — validate format if provided
  if (data.customerPhone && safeStr(data.customerPhone)) {
    const phoneErr = validatePhone(data.customerPhone);
    if (phoneErr) errors.customerPhone = phoneErr;
  }

  // Remarks (optional) — length check
  if (data.remarks && safeStr(data.remarks).length > 1000) {
    errors.remarks = "Remarks must be under 1000 characters";
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors
  };
}

// ─── Field Validators ──────────────────────────────────────────────────────

/**
 * Validate a positive number (> 0).
 * Returns an error string or null.
 * @param {*} val
 * @param {string} fieldName
 * @returns {string|null}
 */
export function validatePositiveNumber(val, fieldName = "Value") {
  if (val === "" || val === null || val === undefined) {
    return `${fieldName} is required`;
  }
  const n = Number(val);
  if (isNaN(n))      return `${fieldName} must be a valid number`;
  if (!isFinite(n))  return `${fieldName} must be a finite number`;
  if (n <= 0)        return `${fieldName} must be greater than zero`;
  if (n > 999999999) return `${fieldName} is too large`;
  return null;
}

/**
 * Validate a non-negative number (>= 0).
 * Returns an error string or null.
 * @param {*} val
 * @param {string} fieldName
 * @returns {string|null}
 */
export function validateNonNegativeNumber(val, fieldName = "Value") {
  if (val === "" || val === null || val === undefined) {
    return `${fieldName} is required`;
  }
  const n = Number(val);
  if (isNaN(n))      return `${fieldName} must be a valid number`;
  if (!isFinite(n))  return `${fieldName} must be a finite number`;
  if (n < 0)         return `${fieldName} cannot be negative`;
  if (n > 999999999) return `${fieldName} is too large`;
  return null;
}

/**
 * Validate a date string (YYYY-MM-DD format).
 * @param {string} dateStr
 * @returns {boolean}
 */
export function isValidDate(dateStr) {
  if (!dateStr) return false;
  const date = new Date(dateStr);
  return !isNaN(date.getTime());
}

/**
 * Validate a phone number (basic — must be digits, optional + prefix, 7-15 chars).
 * Returns error string or null.
 * @param {string} phone
 * @returns {string|null}
 */
export function validatePhone(phone) {
  const cleaned = String(phone).replace(/[\s\-\(\)\+]/g, "");
  if (!/^\d{7,15}$/.test(cleaned)) {
    return "Enter a valid phone number (7–15 digits)";
  }
  return null;
}

/**
 * Validate customer form data.
 * @param {object} data
 * @returns {{ valid: boolean, errors: Record<string, string> }}
 */
export function validateCustomerForm(data) {
  const errors = {};

  const name = safeStr(data.name);
  if (!name) {
    errors.name = "Customer name is required";
  } else if (name.length < 2) {
    errors.name = "Name must be at least 2 characters";
  } else if (name.length > 200) {
    errors.name = "Name is too long";
  }

  if (data.phone && safeStr(data.phone)) {
    const phoneErr = validatePhone(data.phone);
    if (phoneErr) errors.phone = phoneErr;
  }

  if (data.address && safeStr(data.address).length > 500) {
    errors.address = "Address is too long";
  }

  if (data.notes && safeStr(data.notes).length > 1000) {
    errors.notes = "Notes are too long";
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

/**
 * Validate settings form data.
 * @param {object} data
 * @returns {{ valid: boolean, errors: Record<string, string> }}
 */
export function validateSettingsForm(data) {
  const errors = {};

  if (data.billPrefix) {
    const prefix = safeStr(data.billPrefix);
    if (!/^[A-Za-z0-9\-_]{1,10}$/.test(prefix)) {
      errors.billPrefix = "Prefix must be 1–10 alphanumeric characters, hyphens, or underscores";
    }
  }

  if (data.defaultCommissionPerQuintal !== undefined && data.defaultCommissionPerQuintal !== "") {
    const err = validateNonNegativeNumber(data.defaultCommissionPerQuintal, "Default commission");
    if (err) errors.defaultCommissionPerQuintal = err;
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

// ─── UI Helpers ───────────────────────────────────────────────────────────

/**
 * Apply validation errors to form elements.
 * @param {HTMLFormElement} form
 * @param {Record<string, string>} errors
 */
export function applyFormErrors(form, errors) {
  // Clear previous errors
  form.querySelectorAll(".form-control.error").forEach(el => {
    el.classList.remove("error");
  });
  form.querySelectorAll(".form-error").forEach(el => {
    el.textContent = "";
    el.classList.add("hidden");
  });

  // Apply new errors
  for (const [field, message] of Object.entries(errors)) {
    const input = form.querySelector(`[name="${field}"], [data-field="${field}"]`);
    if (input) {
      input.classList.add("error");
      // Look for error message container
      const errorEl = form.querySelector(`[data-error="${field}"]`);
      if (errorEl) {
        errorEl.textContent = message;
        errorEl.classList.remove("hidden");
      }
    }
  }
}

/**
 * Clear all form errors.
 * @param {HTMLFormElement} form
 */
export function clearFormErrors(form) {
  form.querySelectorAll(".form-control.error").forEach(el => el.classList.remove("error"));
  form.querySelectorAll(".form-error").forEach(el => {
    el.textContent = "";
    el.classList.add("hidden");
  });
}

/**
 * Sanitize a number input value, returning a safe number or NaN.
 * @param {string} val
 * @returns {number}
 */
export function parseNumericInput(val) {
  const cleaned = String(val || "").replace(/[^\d.]/g, "");
  return parseFloat(cleaned);
}
