/**
 * bill-form.js
 * 
 * Manages the Create Bill and Edit Bill form.
 * - Live calculation without server requests
 * - Customer autocomplete with debouncing
 * - Draft saving to IndexedDB
 * - Submission through Cloud Functions
 * - Idempotent save retries
 */

import { calculateBill } from "./bill-calculator.js";
import { renderBillPreview } from "./receipt-renderer.js";
import { validateBillForm, applyFormErrors, clearFormErrors, parseNumericInput } from "./validation.js";
import { formatCurrency, formatQuantity, todayInputDate, safeStr } from "./formatting.js";
import { saveDraft, loadDraft, clearDraft, hasDraft, getDraftTimestamp } from "./local-drafts.js";
import { createBill, editBill, newIdempotencyKey } from "../services/bill-service.js";
import { searchCustomers } from "../services/customer-service.js";
import { getSettings } from "../services/settings-service.js";
import { generateBillPdf, printReceipt } from "./pdf-generator.js";
import { shareViaWhatsApp } from "./whatsapp-share.js";
import { showToast, showConfirm } from "../app.js";

// ─── State ─────────────────────────────────────────────────────────────────

let _currentIdempotencyKey = null;  // Reset on each new bill, preserved on retry
let _isSaving = false;
let _savedBill = null;              // The confirmed saved bill after successful create/edit
let _editingBillId = null;          // Set when editing an existing bill
let _draftSaveTimer = null;
let _calcResult = null;

// ─── Initialization ────────────────────────────────────────────────────────

export async function initBillForm(editBillData = null) {
  const form = document.getElementById("bill-form");
  if (!form) return;

  // Set today's date as default
  const dateInput = form.querySelector('[name="billDate"]');
  if (dateInput && !dateInput.value) {
    dateInput.value = todayInputDate();
  }

  // Set default commission from settings
  const settings = getSettings();
  const commInput = form.querySelector('[name="commissionPerQuintal"]');
  if (commInput && !commInput.value && settings.defaultCommissionPerQuintal > 0) {
    commInput.value = settings.defaultCommissionPerQuintal;
  }

  // Editing mode: populate from existing bill
  if (editBillData) {
    _editingBillId = editBillData.id;
    _currentIdempotencyKey = null; // Not needed for edits
    populateFormFromBill(form, editBillData);
    updateSaveState("draft");
    triggerCalculation(form);
  } else {
    _editingBillId = null;
    // Check for saved draft
    const draft = await loadDraft();
    if (draft && Object.keys(draft).some(k => draft[k])) {
      const timestamp = await getDraftTimestamp();
      showDraftRestorePrompt(form, draft, timestamp);
    }
    generateNewIdempotencyKey();
  }

  // Wire up form events
  wireFormEvents(form);
  wireActionButtons(form);

  // Initial preview update
  triggerCalculation(form);
}

// ─── Form Population ───────────────────────────────────────────────────────

function populateFormFromBill(form, bill) {
  const set = (name, val) => {
    const el = form.querySelector(`[name="${name}"]`);
    if (el) el.value = val ?? "";
  };

  set("billDate",              bill.billDate);
  set("customerName",          bill.customerNameSnapshot || bill.customerName);
  set("customerPhone",         bill.customerPhoneSnapshot || bill.customerPhone);
  set("particular",            bill.particular);
  set("quantityTons",          bill.quantityTons);
  set("ratePerQuintal",        bill.ratePerQuintal);
  set("commissionPerQuintal",  bill.commissionPerQuintal);
  set("remarks",               bill.remarks);

  // Store customerId for edit
  form.dataset.customerId = bill.customerId || "";
}

// ─── Event Wiring ─────────────────────────────────────────────────────────

function wireFormEvents(form) {
  // Numeric inputs: trigger calculation on input
  const calcFields = ["quantityTons", "ratePerQuintal", "commissionPerQuintal"];
  calcFields.forEach(name => {
    const el = form.querySelector(`[name="${name}"]`);
    if (el) {
      el.addEventListener("input", () => triggerCalculation(form));
      el.addEventListener("change", () => triggerCalculation(form));
    }
  });

  // All fields: auto-save draft on change
  form.querySelectorAll(".form-control").forEach(el => {
    el.addEventListener("change", () => scheduleDraftSave(form));
    el.addEventListener("input",  () => scheduleDraftSave(form));
  });

  // Customer autocomplete
  const customerInput = form.querySelector('[name="customerName"]');
  if (customerInput) {
    initCustomerAutocomplete(form, customerInput);
  }

  // Clear error when user types in a field
  form.querySelectorAll(".form-control").forEach(el => {
    el.addEventListener("input", () => {
      el.classList.remove("error");
      const errorEl = form.querySelector(`[data-error="${el.name || el.dataset.field}"]`);
      if (errorEl) errorEl.classList.add("hidden");
    });
  });
}

function wireActionButtons(form) {
  const saveBtn        = document.getElementById("save-btn");
  const savePrintBtn   = document.getElementById("save-print-btn");
  const savePdfBtn     = document.getElementById("save-pdf-btn");
  const resetBtn       = document.getElementById("reset-btn");
  const printBtn       = document.getElementById("print-saved-btn");
  const pdfBtn         = document.getElementById("pdf-saved-btn");
  const waBtn          = document.getElementById("wa-btn");

  if (saveBtn)      saveBtn.addEventListener("click",      () => handleSave(form, { action: "save"  }));
  if (savePrintBtn) savePrintBtn.addEventListener("click", () => handleSave(form, { action: "print" }));
  if (savePdfBtn)   savePdfBtn.addEventListener("click",   () => handleSave(form, { action: "pdf"   }));
  if (resetBtn)     resetBtn.addEventListener("click",     () => handleReset(form));

  // Post-save buttons
  if (printBtn) printBtn.addEventListener("click", () => { if (_savedBill) printReceipt(_savedBill); });
  if (pdfBtn)   pdfBtn.addEventListener("click",   () => { if (_savedBill) generateBillPdf(_savedBill); });
  if (waBtn)    waBtn.addEventListener("click",    () => { if (_savedBill) shareViaWhatsApp(_savedBill); });
}

// ─── Calculation ───────────────────────────────────────────────────────────

function triggerCalculation(form) {
  const tons = parseNumericInput(form.querySelector('[name="quantityTons"]')?.value);
  const rate = parseNumericInput(form.querySelector('[name="ratePerQuintal"]')?.value);
  const comm = parseNumericInput(form.querySelector('[name="commissionPerQuintal"]')?.value);

  _calcResult = calculateBill({ quantityTons: tons, ratePerQuintal: rate, commissionPerQuintal: comm });

  // Update read-only display fields
  updateDisplayField(form, "quantityQuintals", _calcResult.valid ? formatQuantity(_calcResult.quantityQuintals) : "");
  updateDisplayField(form, "totalBill",        _calcResult.valid ? formatCurrency(_calcResult.totalBill) : "");
  updateDisplayField(form, "totalCommission",  _calcResult.valid ? formatCurrency(_calcResult.totalCommission) : "");

  // Update receipt preview
  updatePreview(form);
}

function updateDisplayField(form, name, value) {
  const el = form.querySelector(`[data-display="${name}"]`);
  if (el) el.textContent = value || "—";
}

function updatePreview(form) {
  const previewEl = document.getElementById("bill-preview-content");
  if (!previewEl) return;

  const settings = getSettings();
  const formData = readFormData(form);

  const billData = {
    ...formData,
    quantityQuintals:   _calcResult?.valid ? _calcResult.quantityQuintals : 0,
    totalBill:          _calcResult?.valid ? _calcResult.totalBill         : 0,
    totalCommission:    _calcResult?.valid ? _calcResult.totalCommission    : 0,
    billNumber:         _savedBill?.billNumber || null
  };

  previewEl.innerHTML = renderBillPreview(billData, settings);
}

// ─── Form Data Reading ─────────────────────────────────────────────────────

function readFormData(form) {
  const get = (name) => {
    const el = form.querySelector(`[name="${name}"]`);
    return el ? el.value.trim() : "";
  };

  return {
    billDate:              get("billDate"),
    customerName:          get("customerName"),
    customerPhone:         get("customerPhone"),
    customerId:            form.dataset.customerId || null,
    particular:            get("particular"),
    quantityTons:          parseNumericInput(get("quantityTons")),
    ratePerQuintal:        parseNumericInput(get("ratePerQuintal")),
    commissionPerQuintal:  parseNumericInput(get("commissionPerQuintal")),
    remarks:               get("remarks")
  };
}

// ─── Save ──────────────────────────────────────────────────────────────────

async function handleSave(form, { action = "save" }) {
  if (_isSaving) return;

  // Validate
  const formData = readFormData(form);
  const { valid, errors } = validateBillForm({
    ...formData,
    customerName: safeStr(formData.customerName)
  });

  if (!valid) {
    applyFormErrors(form, errors);
    showToast({ type: "error", title: "Please fix the errors", message: Object.values(errors)[0] });
    return;
  }

  // Compute calc values
  if (!_calcResult || !_calcResult.valid) {
    showToast({ type: "error", title: "Calculation error", message: "Check the quantity, rate, and commission values." });
    return;
  }

  // Build complete bill data
  const settings = getSettings();
  const billPayload = {
    ...formData,
    quantityQuintals:          _calcResult.quantityQuintals,
    totalBill:                 _calcResult.totalBill,
    totalCommission:           _calcResult.totalCommission,
    businessNameSnapshot:      settings.businessName    || "",
    businessAddressSnapshot:   settings.businessAddress || "",
    businessContactSnapshot:   settings.phone           || "",
    bankDetails:               settings.bankDetails     || "",
    billPrefix:                settings.billPrefix      || "BILL",
    customerNameSnapshot:      safeStr(formData.customerName),
    customerPhoneSnapshot:     safeStr(formData.customerPhone),
    customerAddressSnapshot:   "",  // not collected on form, but required by bill-service
    customerNameLower:         safeStr(formData.customerName).toLowerCase(),
    particularLower:           safeStr(formData.particular).toLowerCase(),
    billDateTs:                new Date(formData.billDate).getTime(),
    templateVersion:           1
  };

  setSaving(true, form);

  // Wrap with a 15s timeout — if Firestore hangs, fail gracefully
  const withTimeout = (promise, ms) => Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error("Save timed out. Check your connection and try again.")), ms))
  ]);

  try {
    let result;

    if (_editingBillId) {
      result = await withTimeout(editBill(_editingBillId, billPayload), 15000);
    } else {
      if (!_currentIdempotencyKey) generateNewIdempotencyKey();
      result = await withTimeout(createBill(billPayload, _currentIdempotencyKey), 15000);
    }

    _savedBill = result;
    setSaving(false, form);
    updateSaveState("saved");
    clearDraft();

    // Show success
    showToast({
      type:    "success",
      title:   _editingBillId ? "Bill updated!" : `Bill saved: ${result.billNumber}`,
      message: _editingBillId ? `Bill ${result.billNumber} has been updated.` : "Bill saved successfully."
    });

    // Update bill number in preview
    updatePreview(form);
    showPostSaveActions();

    // Generate a new idempotency key for the next bill
    if (!_editingBillId) generateNewIdempotencyKey();

    // Perform action
    if (action === "print") {
      setTimeout(() => printReceipt(_savedBill), 300);
    } else if (action === "pdf") {
      setTimeout(() => generateBillPdf(_savedBill), 300);
    }

  } catch (err) {
    console.error("[BillForm] Save failed:", err);
    setSaving(false, form);
    updateSaveState("error");
    showToast({
      type:    "error",
      title:   "Save failed",
      message: err.message || "An error occurred. Please try again.",
      duration: 8000
    });
  }
}

// ─── Reset ─────────────────────────────────────────────────────────────────

async function handleReset(form) {
  if (_savedBill) {
    const confirmed = await showConfirm({
      title:       "Start new bill?",
      message:     "This will clear the current bill. The saved bill is preserved in history.",
      confirmText: "Start New",
      danger:      false
    });
    if (!confirmed) return;
  }

  form.reset();
  form.querySelector('[name="billDate"]').value = todayInputDate();

  const settings = getSettings();
  const commInput = form.querySelector('[name="commissionPerQuintal"]');
  if (commInput && settings.defaultCommissionPerQuintal > 0) {
    commInput.value = settings.defaultCommissionPerQuintal;
  }

  clearFormErrors(form);
  _savedBill = null;
  _editingBillId = null;
  _calcResult = null;
  form.dataset.customerId = "";
  generateNewIdempotencyKey();
  updateSaveState("draft");
  hidePostSaveActions();
  triggerCalculation(form);
  clearDraft();
}

// ─── Save State UI ─────────────────────────────────────────────────────────

function setSaving(saving, form) {
  _isSaving = saving;

  const btns = ["save-btn", "save-print-btn", "save-pdf-btn"];
  btns.forEach(id => {
    const btn = document.getElementById(id);
    if (!btn) return;
    if (saving) {
      btn.disabled = true;
      btn.classList.add("btn-loading");
      btn.querySelector(".btn-text") && (btn.querySelector(".btn-text").textContent = "Saving...");
    } else {
      btn.disabled = false;
      btn.classList.remove("btn-loading");
    }
  });

  // Restore button labels
  if (!saving) {
    const labels = {
      "save-btn":       "Save Bill",
      "save-print-btn": "Save & Print",
      "save-pdf-btn":   "Save & PDF"
    };
    Object.entries(labels).forEach(([id, label]) => {
      const btn = document.getElementById(id);
      const span = btn?.querySelector(".btn-text");
      if (span) span.textContent = label;
    });
  }

  if (saving) updateSaveState("saving");
}

function updateSaveState(state) {
  const el = document.getElementById("save-state-banner");
  if (!el) return;

  const states = {
    draft:  { cls: "draft",   icon: "⬛", text: "Draft — not saved yet" },
    saving: { cls: "saving",  icon: "⏳", text: "Saving to cloud..." },
    saved:  { cls: "saved",   icon: "✅", text: `Saved — ${_savedBill?.billNumber || ""}` },
    error:  { cls: "error",   icon: "❌", text: "Save failed — please retry" },
    offline:{ cls: "offline", icon: "📵", text: "Offline — draft saved locally" }
  };

  const s = states[state] || states.draft;
  el.className = `save-state ${s.cls}`;
  el.innerHTML = `<span>${s.icon}</span><span>${s.text}</span>`;
  el.classList.remove("hidden");
}

function showPostSaveActions() {
  const section = document.getElementById("post-save-actions");
  if (section) section.classList.remove("hidden");
}

function hidePostSaveActions() {
  const section = document.getElementById("post-save-actions");
  if (section) section.classList.add("hidden");
}

// ─── Draft ────────────────────────────────────────────────────────────────

function scheduleDraftSave(form) {
  if (_editingBillId) return; // Don't auto-save drafts when editing
  clearTimeout(_draftSaveTimer);
  _draftSaveTimer = setTimeout(() => {
    const data = readFormData(form);
    saveDraft(data);
  }, 1000);
}

function showDraftRestorePrompt(form, draft, timestamp) {
  const banner = document.getElementById("draft-restore-banner");
  if (!banner) return;

  const timeStr = timestamp ? new Date(timestamp).toLocaleTimeString("en-IN") : "";
  banner.innerHTML = `
    <span class="text-sm">📝 Draft saved ${timeStr ? "at " + timeStr : "previously"}</span>
    <div class="flex gap-2">
      <button id="restore-draft-btn" class="btn btn-sm btn-primary">Restore Draft</button>
      <button id="discard-draft-btn" class="btn btn-sm btn-ghost">Discard</button>
    </div>
  `;
  banner.classList.remove("hidden");

  document.getElementById("restore-draft-btn")?.addEventListener("click", () => {
    populateFormFromBill(form, {
      billDate:             draft.billDate,
      customerNameSnapshot: draft.customerName,
      customerPhoneSnapshot:draft.customerPhone,
      particular:           draft.particular,
      quantityTons:         draft.quantityTons,
      ratePerQuintal:       draft.ratePerQuintal,
      commissionPerQuintal: draft.commissionPerQuintal,
      remarks:              draft.remarks,
      customerId:           draft.customerId
    });
    triggerCalculation(form);
    banner.classList.add("hidden");
    showToast({ type: "info", title: "Draft restored" });
  });

  document.getElementById("discard-draft-btn")?.addEventListener("click", () => {
    clearDraft();
    banner.classList.add("hidden");
  });
}

// ─── Customer Autocomplete ─────────────────────────────────────────────────

function initCustomerAutocomplete(form, input) {
  let debounceTimer = null;
  let activeResults = [];

  const list = document.getElementById("customer-suggestions");
  if (!list) return;

  input.addEventListener("input", () => {
    clearTimeout(debounceTimer);
    const val = input.value.trim();

    if (val.length < 2) {
      list.classList.add("hidden");
      return;
    }

    debounceTimer = setTimeout(async () => {
      try {
        activeResults = await searchCustomers(val, 8);
        if (activeResults.length === 0) {
          list.classList.add("hidden");
          return;
        }
        renderSuggestions(form, input, list, activeResults);
      } catch {
        list.classList.add("hidden");
      }
    }, 300);
  });

  // Close on click outside
  document.addEventListener("click", e => {
    if (!input.contains(e.target) && !list.contains(e.target)) {
      list.classList.add("hidden");
    }
  });

  input.addEventListener("keydown", e => {
    if (!list.classList.contains("hidden")) {
      if (e.key === "Escape") list.classList.add("hidden");
    }
  });
}

function renderSuggestions(form, input, list, customers) {
  list.innerHTML = customers.map((c, i) => `
    <div class="autocomplete-item" data-index="${i}" tabindex="0"
         role="option" aria-label="${c.name}">
      <span class="font-medium">${escHtml(c.name)}</span>
      ${c.phone ? `<span class="autocomplete-item-sub">📞 ${escHtml(c.phone)}</span>` : ""}
      ${c.address ? `<span class="autocomplete-item-sub">📍 ${escHtml(c.address)}</span>` : ""}
    </div>
  `).join("");

  list.classList.remove("hidden");

  list.querySelectorAll(".autocomplete-item").forEach((item, i) => {
    item.addEventListener("click", () => {
      const customer = customers[i];
      input.value = customer.name;

      const phoneInput = form.querySelector('[name="customerPhone"]');
      if (phoneInput && customer.phone) phoneInput.value = customer.phone;

      form.dataset.customerId = customer.id;
      list.classList.add("hidden");
    });
  });
}

// ─── Utilities ─────────────────────────────────────────────────────────────

function generateNewIdempotencyKey() {
  _currentIdempotencyKey = newIdempotencyKey();
}

function escHtml(str) {
  if (!str) return "";
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export { readFormData, _savedBill };
