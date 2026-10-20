/**
 * bills-page.js
 * Page controller for Bill History (bills.html)
 * Handles search tabs, results table, pagination, and bill modal.
 */

import { initTheme, loadSettings, toggleTheme, getCurrentTheme } from "../services/settings-service.js";
import { initFirebase, isFirebaseConfigured } from "../firebase-init.js";
import {
  getBillsPaginated, searchByBillNumber, searchByCustomerName,
  searchByPhone, searchByDateRange, getBillById, deleteBill
} from "../services/bill-service.js";
import { generateBillPdf, printReceipt } from "../modules/pdf-generator.js";
import { shareViaWhatsApp } from "../modules/whatsapp-share.js";
import { formatCurrency, formatDate, formatQuantity } from "../modules/formatting.js";
import { renderReceipt } from "../modules/receipt-renderer.js";

// ─── State ─────────────────────────────────────────────────────────────────
let _currentTab      = "name";
let _lastDocs        = [];        // cursor stack for back-navigation
let _currentCursor   = null;
let _pageSize        = 20;
let _currentQuery    = null;
let _currentBill     = null;      // bill shown in modal
let _debounceTimer   = null;
let _pendingRequestId = 0;        // prevents stale result races

// ─── Boot ──────────────────────────────────────────────────────────────────
initTheme();
document.addEventListener("DOMContentLoaded", async () => {
  initFirebase();
  setupNav();
  setupThemeToggle();
  setupNetworkMonitor();
  setupTabs();
  setupSearchInputs();
  setupPagination();
  setupModal();
  const settings = await loadSettings();
  document.querySelectorAll("[data-biz-name]").forEach(el => {
    if (settings.businessName) el.textContent = settings.businessName;
  });
});

// ─── Navigation Helpers ────────────────────────────────────────────────────
function setupNav() {
  document.querySelectorAll(".nav-link, .bottom-nav-link").forEach(link => {
    const href = link.getAttribute("href");
    if (href && href.includes("bills")) {
      link.classList.add("active");
      link.setAttribute("aria-current", "page");
    }
  });
}

function setupThemeToggle() {
  const btn = document.getElementById("theme-toggle-btn");
  if (!btn) return;
  const render = (t) => {
    const cur = t || getCurrentTheme();
    btn.innerHTML = cur === "dark"
      ? `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`
      : `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;
  };
  render();
  btn.addEventListener("click", () => render(toggleTheme()));
}

function setupNetworkMonitor() {
  const banner = document.getElementById("offline-banner");
  const update = () => banner?.classList.toggle("hidden", navigator.onLine);
  window.addEventListener("online", update);
  window.addEventListener("offline", update);
  update();
}

// ─── Tabs ─────────────────────────────────────────────────────────────────
function setupTabs() {
  document.querySelectorAll(".tab").forEach(tab => {
    tab.addEventListener("click", () => {
      const id = tab.dataset.tab;
      document.querySelectorAll(".tab").forEach(t => {
        t.classList.toggle("active", t.dataset.tab === id);
        t.setAttribute("aria-selected", t.dataset.tab === id ? "true" : "false");
      });
      document.querySelectorAll(".search-panel").forEach(p => {
        p.classList.toggle("hidden", p.id !== `search-panel-${id}`);
      });
      _currentTab = id;
      resetResults();
    });
  });
}

// ─── Search Inputs ─────────────────────────────────────────────────────────
function setupSearchInputs() {
  // Text inputs — debounced
  ["search-name", "search-phone"].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener("input", () => {
      clearTimeout(_debounceTimer);
      _debounceTimer = setTimeout(() => runSearch(el.value.trim()), 400);
    });
    el.addEventListener("keydown", e => {
      if (e.key === "Enter") {
        clearTimeout(_debounceTimer);
        runSearch(el.value.trim());
      }
    });
  });

  // Bill number — debounced, uppercase
  const billNoInput = document.getElementById("search-billno");
  if (billNoInput) {
    billNoInput.addEventListener("input", () => {
      billNoInput.value = billNoInput.value.toUpperCase();
      clearTimeout(_debounceTimer);
      _debounceTimer = setTimeout(() => runSearch(billNoInput.value.trim()), 400);
    });
  }

  // Date range
  document.getElementById("search-date-btn")?.addEventListener("click", () => {
    const from = document.getElementById("search-date-from")?.value;
    const to   = document.getElementById("search-date-to")?.value;
    if (!from || !to) { toast("warning", "Select both dates"); return; }
    if (from > to)    { toast("warning", "From date must be before To date"); return; }
    runSearch({ from, to });
  });

  // Load all
  document.getElementById("load-all-btn")?.addEventListener("click", () => {
    _pageSize = parseInt(document.getElementById("page-size-select")?.value || "20");
    resetResults();
    fetchPage(null);
  });
}

// ─── Search Runner ─────────────────────────────────────────────────────────
async function runSearch(query) {
  if (!query) { resetResults(); return; }
  _currentQuery = query;
  _currentCursor = null;
  _lastDocs = [];
  await fetchPage(null);
}

async function fetchPage(cursor) {
  if (!isFirebaseConfigured()) {
    showEmpty("Firebase is not configured. Update firebase-config.js first.");
    return;
  }
  showLoading();
  const requestId = ++_pendingRequestId;

  try {
    let result;

    if (_currentTab === "all") {
      result = await getBillsPaginated({ pageSize: _pageSize, cursor });

    } else if (_currentTab === "name" && typeof _currentQuery === "string") {
      const rows = await searchByCustomerName(_currentQuery, _pageSize);
      result = { bills: rows, lastDoc: null, hasMore: false };

    } else if (_currentTab === "billno" && typeof _currentQuery === "string") {
      const rows = await searchByBillNumber(_currentQuery);
      result = { bills: rows, lastDoc: null, hasMore: false };

    } else if (_currentTab === "phone" && typeof _currentQuery === "string") {
      const rows = await searchByPhone(_currentQuery, _pageSize);
      result = { bills: rows, lastDoc: null, hasMore: false };

    } else if (_currentTab === "date" && _currentQuery?.from) {
      result = await searchByDateRange(_currentQuery.from, _currentQuery.to, cursor, _pageSize);

    } else {
      showEmpty(); return;
    }

    if (requestId !== _pendingRequestId) return; // stale response
    renderResults(result, cursor);

  } catch (err) {
    if (requestId !== _pendingRequestId) return;
    console.error("[Bills] Search error:", err);
    showEmpty("Search failed: " + (err.message || "Unknown error"));
  }
}

// ─── Render ────────────────────────────────────────────────────────────────
function renderResults({ bills, lastDoc, hasMore }, cursor) {
  const tbody     = document.getElementById("bills-tbody");
  const container = document.getElementById("bills-table-container");
  const empty     = document.getElementById("bills-empty");
  const loading   = document.getElementById("bills-loading");
  const pagination = document.getElementById("bills-pagination");
  const count     = document.getElementById("results-count");

  loading.classList.add("hidden");

  if (!bills || bills.length === 0) {
    container.classList.add("hidden");
    pagination.classList.add("hidden");
    empty.classList.remove("hidden");
    empty.querySelector(".empty-state-title").textContent = "No bills found";
    empty.querySelector(".empty-state-description").textContent = "Try a different search term.";
    count.textContent = "0";
    return;
  }

  empty.classList.add("hidden");
  container.classList.remove("hidden");
  count.textContent = bills.length + (hasMore ? "+" : "");

  tbody.innerHTML = bills.map(bill => `
    <tr data-bill-id="${esc(bill.id)}">
      <td>
        <span class="badge badge-blue font-mono" style="font-size: 11px;">${esc(bill.billNumber || "—")}</span>
      </td>
      <td class="text-sm">${esc(formatDate(bill.billDate))}</td>
      <td>
        <div class="font-medium text-sm">${esc(bill.customerNameSnapshot || "—")}</div>
        ${bill.customerPhoneSnapshot ? `<div class="text-xs text-muted">${esc(bill.customerPhoneSnapshot)}</div>` : ""}
      </td>
      <td class="hide-mobile text-sm text-secondary">${esc(bill.particular || "—")}</td>
      <td class="hide-mobile font-mono text-sm">${esc(formatQuantity(bill.quantityTons || 0))}</td>
      <td class="text-right currency-cell font-semibold text-sm">${esc(formatCurrency(bill.totalBill || 0))}</td>
      <td class="text-right hide-mobile" style="color: var(--clr-success-600); font-size: var(--text-xs); font-family: var(--font-mono);">${esc(formatCurrency(bill.totalCommission || 0))}</td>
      <td class="text-center">
        <div class="action-menu" style="justify-content: center;">
          <button class="btn btn-ghost btn-sm view-btn" data-id="${esc(bill.id)}" title="View bill" aria-label="View ${esc(bill.billNumber)}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
          </button>
          <button class="btn btn-ghost btn-sm print-btn" data-id="${esc(bill.id)}" title="Print" aria-label="Print ${esc(bill.billNumber)}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
          </button>
        </div>
      </td>
    </tr>
  `).join("");

  // Row click → view
  tbody.querySelectorAll("tr[data-bill-id]").forEach(row => {
    row.style.cursor = "pointer";
    row.addEventListener("click", (e) => {
      if (e.target.closest(".btn")) return; // don't intercept button clicks
      openBillModal(row.dataset.billId, bills);
    });
  });

  tbody.querySelectorAll(".view-btn").forEach(btn => {
    btn.addEventListener("click", () => openBillModal(btn.dataset.id, bills));
  });

  tbody.querySelectorAll(".print-btn").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const bill = bills.find(b => b.id === btn.dataset.id) || await getBillById(btn.dataset.id);
      if (bill) printReceipt(bill);
    });
  });

  // Pagination
  _currentCursor = lastDoc;
  updatePagination(hasMore, cursor);
}

// ─── Pagination ────────────────────────────────────────────────────────────
function setupPagination() {
  document.getElementById("next-page-btn")?.addEventListener("click", () => {
    if (_currentCursor) {
      _lastDocs.push(_currentCursor);
      fetchPage(_currentCursor);
    }
  });
  document.getElementById("prev-page-btn")?.addEventListener("click", () => {
    const prev = _lastDocs.pop() || null;
    fetchPage(prev);
  });
}

function updatePagination(hasMore, cursor) {
  const pag     = document.getElementById("bills-pagination");
  const prevBtn = document.getElementById("prev-page-btn");
  const nextBtn = document.getElementById("next-page-btn");
  const info    = document.getElementById("pagination-info");

  const isFirstPage = _lastDocs.length === 0 && !cursor;
  pag.classList.toggle("hidden", !hasMore && isFirstPage);
  prevBtn.disabled = isFirstPage;
  nextBtn.disabled = !hasMore;
  info.textContent = `Page ${_lastDocs.length + 1}`;
}

// ─── Modal ─────────────────────────────────────────────────────────────────
function setupModal() {
  const modal   = document.getElementById("bill-modal");
  const closeBtn = document.getElementById("close-bill-modal");

  closeBtn?.addEventListener("click", closeModal);
  modal?.addEventListener("click", e => { if (e.target === modal) closeModal(); });

  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && !modal.classList.contains("hidden")) closeModal();
  });

  document.getElementById("modal-print-btn")?.addEventListener("click", () => {
    if (_currentBill) printReceipt(_currentBill);
  });
  document.getElementById("modal-pdf-btn")?.addEventListener("click", () => {
    if (_currentBill) generateBillPdf(_currentBill).catch(err => toast("error", err.message));
  });
  document.getElementById("modal-wa-btn")?.addEventListener("click", () => {
    if (_currentBill) shareViaWhatsApp(_currentBill);
  });
  document.getElementById("modal-edit-btn")?.addEventListener("click", () => {
    if (_currentBill) {
      sessionStorage.setItem("jijubill-edit-bill", JSON.stringify(_currentBill));
      location.href = "index.html?edit=" + _currentBill.id;
    }
  });
  document.getElementById("modal-delete-btn")?.addEventListener("click", () => handleDelete());
}

async function openBillModal(billId, cachedBills = []) {
  const modal = document.getElementById("bill-modal");
  const body  = document.getElementById("modal-bill-body");
  const title = document.getElementById("modal-bill-number");

  modal.classList.remove("hidden");
  body.innerHTML = `<div style="padding: var(--spacing-8); text-align: center;"><div class="spinner spinner-lg" style="margin: auto;"></div><p class="text-muted text-sm" style="margin-top: var(--spacing-3);">Loading…</p></div>`;

  try {
    let bill = cachedBills.find(b => b.id === billId);
    if (!bill) bill = await getBillById(billId);
    if (!bill) throw new Error("Bill not found");

    _currentBill = bill;
    title.textContent = bill.billNumber || "Bill Details";
    body.innerHTML = renderBillDetail(bill);
  } catch (err) {
    body.innerHTML = `<div style="padding: var(--spacing-6); text-align: center;" class="text-danger">${esc(err.message)}</div>`;
  }
}

function renderBillDetail(bill) {
  return `
    <div style="padding: var(--spacing-5);">
      <div class="bill-detail-section">
        <div class="bill-detail-section-title">Bill Information</div>
        <div class="bill-detail-row"><span class="bill-detail-label">Bill Number</span><span class="bill-detail-value font-mono text-accent">${esc(bill.billNumber)}</span></div>
        <div class="bill-detail-row"><span class="bill-detail-label">Date</span><span class="bill-detail-value">${esc(formatDate(bill.billDate))}</span></div>
        <div class="bill-detail-row"><span class="bill-detail-label">Business</span><span class="bill-detail-value">${esc(bill.businessNameSnapshot || "—")}</span></div>
      </div>
      <div class="bill-detail-section">
        <div class="bill-detail-section-title">Customer</div>
        <div class="bill-detail-row"><span class="bill-detail-label">Name</span><span class="bill-detail-value">${esc(bill.customerNameSnapshot)}</span></div>
        ${bill.customerPhoneSnapshot ? `<div class="bill-detail-row"><span class="bill-detail-label">Phone</span><span class="bill-detail-value">${esc(bill.customerPhoneSnapshot)}</span></div>` : ""}
        ${bill.customerAddressSnapshot ? `<div class="bill-detail-row"><span class="bill-detail-label">Address</span><span class="bill-detail-value">${esc(bill.customerAddressSnapshot)}</span></div>` : ""}
      </div>
      <div class="bill-detail-section">
        <div class="bill-detail-section-title">Commodity & Quantity</div>
        <div class="bill-detail-row"><span class="bill-detail-label">Particular</span><span class="bill-detail-value">${esc(bill.particular)}</span></div>
        <div class="bill-detail-row"><span class="bill-detail-label">Quantity</span><span class="bill-detail-value">${esc(formatQuantity(bill.quantityTons))} tons</span></div>
        <div class="bill-detail-row"><span class="bill-detail-label">Equivalent</span><span class="bill-detail-value">${esc(formatQuantity(bill.quantityQuintals))} quintals</span></div>
        <div class="bill-detail-row"><span class="bill-detail-label">Rate / Quintal</span><span class="bill-detail-value font-mono">${esc(formatCurrency(bill.ratePerQuintal))}</span></div>
      </div>
      <div class="bill-detail-total">
        <div class="bill-detail-section-title" style="border: none; margin-bottom: var(--spacing-2);">Financials</div>
        <div class="bill-detail-row">
          <span class="bill-detail-label font-semibold">Total Bill Value</span>
          <span class="bill-detail-total-main">${esc(formatCurrency(bill.totalBill))}</span>
        </div>
        <div class="bill-detail-row" style="margin-top: var(--spacing-2);">
          <span class="bill-detail-label" style="color: var(--clr-success-700);">Commission (${esc(formatCurrency(bill.commissionPerQuintal))}/qtl)</span>
          <span class="bill-detail-value" style="color: var(--clr-success-700); font-size: var(--text-lg); font-weight: 700;">${esc(formatCurrency(bill.totalCommission))}</span>
        </div>
      </div>
      ${bill.remarks ? `<div class="bill-detail-section" style="margin-top: var(--spacing-4);"><div class="bill-detail-section-title">Remarks</div><p class="text-sm text-secondary">${esc(bill.remarks)}</p></div>` : ""}
      <div class="text-xs text-muted" style="margin-top: var(--spacing-4);">
        Created: ${bill.createdAt ? esc(formatDate(bill.createdAt)) : "—"} &nbsp;|&nbsp; Template v${bill.templateVersion || 1}
      </div>
    </div>
  `;
}

async function handleDelete() {
  if (!_currentBill) return;
  const confirmed = await new Promise(resolve => {
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.innerHTML = `
      <div class="modal confirm-dialog" style="max-width: 400px;">
        <div class="modal-body" style="padding-top: var(--spacing-6); text-align: center;">
          <div class="confirm-dialog-icon"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg></div>
          <h3 style="margin-bottom: var(--spacing-2);">Delete Bill?</h3>
          <p class="text-secondary text-sm">This will permanently delete <strong>${esc(_currentBill.billNumber)}</strong>. This action cannot be undone. The bill number will never be reused.</p>
        </div>
        <div class="modal-footer">
          <button id="del-cancel" class="btn btn-secondary">Cancel</button>
          <button id="del-confirm" class="btn btn-danger">Delete</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector("#del-confirm").addEventListener("click", () => { overlay.remove(); resolve(true); });
    overlay.querySelector("#del-cancel").addEventListener("click",  () => { overlay.remove(); resolve(false); });
    overlay.addEventListener("click", e => { if (e.target === overlay) { overlay.remove(); resolve(false); } });
  });

  if (!confirmed) return;

  try {
    await deleteBill(_currentBill.id);
    closeModal();
    toast("success", `${_currentBill.billNumber} deleted`);
    resetResults();
  } catch (err) {
    toast("error", "Delete failed: " + err.message);
  }
}

function closeModal() {
  document.getElementById("bill-modal")?.classList.add("hidden");
  _currentBill = null;
}

// ─── UI Helpers ────────────────────────────────────────────────────────────
function showLoading() {
  document.getElementById("bills-loading")?.classList.remove("hidden");
  document.getElementById("bills-empty")?.classList.add("hidden");
  document.getElementById("bills-table-container")?.classList.add("hidden");
  document.getElementById("bills-pagination")?.classList.add("hidden");
}

function showEmpty(msg) {
  document.getElementById("bills-loading")?.classList.add("hidden");
  document.getElementById("bills-table-container")?.classList.add("hidden");
  document.getElementById("bills-pagination")?.classList.add("hidden");
  const el = document.getElementById("bills-empty");
  el?.classList.remove("hidden");
  if (msg && el) {
    el.querySelector(".empty-state-description").textContent = msg;
  }
}

function resetResults() {
  _currentQuery = null;
  _currentCursor = null;
  _lastDocs = [];
  document.getElementById("bills-loading")?.classList.add("hidden");
  document.getElementById("bills-table-container")?.classList.add("hidden");
  document.getElementById("bills-pagination")?.classList.add("hidden");
  document.getElementById("bills-empty")?.classList.remove("hidden");
  document.getElementById("bills-empty").querySelector(".empty-state-title").textContent = "Search for bills";
  document.getElementById("bills-empty").querySelector(".empty-state-description").textContent = "Use the search options above to find bills.";
  document.getElementById("results-count").textContent = "—";
}

function toast(type, message) {
  if (window.showToast) { window.showToast({ type, title: message }); return; }
  const c = document.getElementById("toast-container");
  if (!c) return;
  const t = document.createElement("div");
  t.className = `toast toast-${type}`;
  t.innerHTML = `<div class="toast-body"><div class="toast-title">${esc(message)}</div></div>`;
  c.appendChild(t);
  setTimeout(() => t.remove(), 4000);
}

function esc(s) {
  if (!s) return "";
  return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}
