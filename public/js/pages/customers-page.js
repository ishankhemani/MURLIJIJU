/**
 * customers-page.js — Customers page controller
 */

import { initTheme, loadSettings, toggleTheme, getCurrentTheme } from "../services/settings-service.js";
import { initFirebase, isFirebaseConfigured } from "../firebase-init.js";
import {
  getCustomersPaginated, searchCustomers,
  createCustomer, updateCustomer, deleteCustomer,
  getCustomerBills
} from "../services/customer-service.js";
import { validateCustomerForm, applyFormErrors, clearFormErrors } from "../modules/validation.js";
import { formatCurrency, formatQuantity, getInitials } from "../modules/formatting.js";

// ─── State ─────────────────────────────────────────────────────────────────
let _lastDocs       = [];
let _currentCursor  = null;
let _editingId      = null;
let _currentCustomer = null;
let _debounceTimer  = null;
let _isSearchMode   = false;

// ─── Boot ─────────────────────────────────────────────────────────────────
initTheme();
document.addEventListener("DOMContentLoaded", async () => {
  initFirebase();
  setupNav();
  setupThemeToggle();
  setupNetworkMonitor();
  setupSearch();
  setupModal();
  setupDetailModal();
  setupPagination();

  const settings = await loadSettings();
  document.querySelectorAll("[data-biz-name]").forEach(el => {
    if (settings.businessName) el.textContent = settings.businessName;
  });

  await loadCustomers(null);
});

// ─── Nav ──────────────────────────────────────────────────────────────────
function setupNav() {
  document.querySelectorAll(".nav-link, .bottom-nav-link").forEach(link => {
    if (link.getAttribute("href")?.includes("customers")) {
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

// ─── Load & Search ─────────────────────────────────────────────────────────
async function loadCustomers(cursor) {
  if (!isFirebaseConfigured()) {
    showEmpty("Firebase is not configured. Update firebase-config.js.");
    return;
  }
  showLoading();
  try {
    const result = await getCustomersPaginated({ cursor, pageSize: 20 });
    renderCustomers(result.customers, result.lastDoc, result.hasMore, cursor);
  } catch (err) {
    showEmpty("Failed to load customers: " + err.message);
  }
}

function setupSearch() {
  const input = document.getElementById("customer-search-input");
  if (!input) return;
  input.addEventListener("input", () => {
    clearTimeout(_debounceTimer);
    const val = input.value.trim();
    if (!val) {
      _isSearchMode = false;
      loadCustomers(null);
      return;
    }
    _isSearchMode = true;
    _debounceTimer = setTimeout(async () => {
      showLoading();
      try {
        const results = await searchCustomers(val, 30);
        renderCustomers(results, null, false, null);
      } catch (err) {
        showEmpty("Search failed: " + err.message);
      }
    }, 350);
  });

  // Add customer buttons
  document.getElementById("add-customer-btn")?.addEventListener("click", () => openModal());
  document.getElementById("empty-add-btn")?.addEventListener("click", () => openModal());
}

// ─── Render ───────────────────────────────────────────────────────────────
function renderCustomers(customers, lastDoc, hasMore, cursor) {
  const tbody   = document.getElementById("customers-tbody");
  const table   = document.getElementById("customers-table-container");
  const empty   = document.getElementById("customers-empty");
  const loading = document.getElementById("customers-loading");
  const count   = document.getElementById("customers-count");
  const pag     = document.getElementById("customers-pagination");

  loading.classList.add("hidden");

  if (!customers || customers.length === 0) {
    table.classList.add("hidden");
    pag.classList.add("hidden");
    empty.classList.remove("hidden");
    count.textContent = "0";
    return;
  }

  empty.classList.add("hidden");
  table.classList.remove("hidden");
  count.textContent = customers.length + (hasMore ? "+" : "");

  tbody.innerHTML = customers.map(c => `
    <tr data-cust-id="${esc(c.id)}" style="cursor: pointer;">
      <td>
        <div class="flex items-center gap-3">
          <div class="customer-avatar" style="width:36px;height:36px;font-size:var(--text-sm);">${esc(getInitials(c.name))}</div>
          <div>
            <div class="font-medium text-sm">${esc(c.name)}</div>
            ${c.address ? `<div class="text-xs text-muted">${esc(c.address)}</div>` : ""}
          </div>
        </div>
      </td>
      <td class="hide-mobile text-sm">${c.phone ? `<a href="tel:${esc(c.phone)}" style="color:var(--text-accent)">${esc(c.phone)}</a>` : "—"}</td>
      <td class="text-right hide-mobile text-sm font-medium">${c.totalBills || 0}</td>
      <td class="text-right hide-mobile currency-cell text-sm">${formatCurrency(c.totalBillValue || 0)}</td>
      <td class="text-right hide-mobile" style="color:var(--clr-success-600);font-size:var(--text-xs);font-family:var(--font-mono);">${formatCurrency(c.totalCommission || 0)}</td>
      <td class="text-center">
        <div class="action-menu" style="justify-content:center;">
          <button class="btn btn-ghost btn-sm view-cust-btn" data-id="${esc(c.id)}" title="View" aria-label="View ${esc(c.name)}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
          </button>
          <button class="btn btn-ghost btn-sm edit-cust-btn" data-cust='${JSON.stringify({id:c.id,name:c.name,phone:c.phone||"",address:c.address||"",notes:c.notes||""})}' title="Edit" aria-label="Edit ${esc(c.name)}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
        </div>
      </td>
    </tr>
  `).join("");

  tbody.querySelectorAll("tr[data-cust-id]").forEach(row => {
    row.addEventListener("click", e => {
      if (e.target.closest(".btn")) return;
      openDetailModal(row.dataset.custId, customers);
    });
  });

  tbody.querySelectorAll(".view-cust-btn").forEach(btn => {
    btn.addEventListener("click", () => openDetailModal(btn.dataset.id, customers));
  });

  tbody.querySelectorAll(".edit-cust-btn").forEach(btn => {
    btn.addEventListener("click", e => {
      e.stopPropagation();
      const data = JSON.parse(btn.dataset.cust);
      openModal(data);
    });
  });

  _currentCursor = lastDoc;
  const isFirstPage = _lastDocs.length === 0 && !cursor;
  pag.classList.toggle("hidden", _isSearchMode || (!hasMore && isFirstPage));
  document.getElementById("cust-prev-btn").disabled = isFirstPage;
  document.getElementById("cust-next-btn").disabled = !hasMore;
  document.getElementById("cust-page-info").textContent = `Page ${_lastDocs.length + 1}`;
}

// ─── Pagination ───────────────────────────────────────────────────────────
function setupPagination() {
  document.getElementById("cust-next-btn")?.addEventListener("click", () => {
    if (_currentCursor) { _lastDocs.push(_currentCursor); loadCustomers(_currentCursor); }
  });
  document.getElementById("cust-prev-btn")?.addEventListener("click", () => {
    const prev = _lastDocs.pop() || null;
    loadCustomers(prev);
  });
}

// ─── Add / Edit Modal ─────────────────────────────────────────────────────
function setupModal() {
  document.getElementById("close-customer-modal")?.addEventListener("click", closeModal);
  document.getElementById("cancel-customer-btn")?.addEventListener("click", closeModal);
  document.getElementById("customer-modal")?.addEventListener("click", e => {
    if (e.target.id === "customer-modal") closeModal();
  });
  document.getElementById("customer-form")?.addEventListener("submit", handleSaveCustomer);
}

function openModal(customer = null) {
  _editingId = customer?.id || null;
  const title = document.getElementById("customer-modal-title");
  const form  = document.getElementById("customer-form");
  title.textContent = customer ? "Edit Customer" : "Add Customer";
  form.reset();
  clearFormErrors(form);
  if (customer) {
    form.querySelector("[name='name']").value    = customer.name    || "";
    form.querySelector("[name='phone']").value   = customer.phone   || "";
    form.querySelector("[name='address']").value = customer.address || "";
    form.querySelector("[name='notes']").value   = customer.notes   || "";
  }
  document.getElementById("customer-modal").classList.remove("hidden");
  form.querySelector("[name='name']").focus();
}

function closeModal() {
  document.getElementById("customer-modal").classList.add("hidden");
  _editingId = null;
}

async function handleSaveCustomer(e) {
  e.preventDefault();
  const form = document.getElementById("customer-form");
  const btn  = document.getElementById("save-customer-btn");
  const data = {
    name:    form.querySelector("[name='name']").value.trim(),
    phone:   form.querySelector("[name='phone']").value.trim(),
    address: form.querySelector("[name='address']").value.trim(),
    notes:   form.querySelector("[name='notes']").value.trim(),
  };

  const { valid, errors } = validateCustomerForm(data);
  if (!valid) { applyFormErrors(form, errors); return; }

  btn.disabled = true;
  btn.querySelector(".btn-text").textContent = "Saving…";

  try {
    if (_editingId) {
      await updateCustomer(_editingId, data);
      toast("success", "Customer updated");
    } else {
      await createCustomer(data);
      toast("success", "Customer added");
    }
    closeModal();
    _lastDocs = [];
    await loadCustomers(null);
  } catch (err) {
    toast("error", err.message || "Save failed");
  } finally {
    btn.disabled = false;
    btn.querySelector(".btn-text").textContent = "Save Customer";
  }
}

// ─── Detail Modal ─────────────────────────────────────────────────────────
function setupDetailModal() {
  document.getElementById("close-detail-modal")?.addEventListener("click", closeDetailModal);
  document.getElementById("customer-detail-modal")?.addEventListener("click", e => {
    if (e.target.id === "customer-detail-modal") closeDetailModal();
  });
  document.getElementById("cust-detail-edit-btn")?.addEventListener("click", () => {
    closeDetailModal();
    if (_currentCustomer) openModal(_currentCustomer);
  });
  document.getElementById("cust-detail-bills-btn")?.addEventListener("click", () => {
    if (_currentCustomer) location.href = `bills.html?customer=${encodeURIComponent(_currentCustomer.name)}`;
  });
  document.getElementById("cust-detail-delete-btn")?.addEventListener("click", handleDeleteCustomer);
}

async function openDetailModal(custId, cachedList = []) {
  const modal = document.getElementById("customer-detail-modal");
  const body  = document.getElementById("cust-detail-body");
  const title = document.getElementById("cust-detail-title");
  modal.classList.remove("hidden");
  body.innerHTML = `<div style="padding:var(--spacing-8);text-align:center;"><div class="spinner spinner-lg" style="margin:auto;"></div></div>`;

  const customer = cachedList.find(c => c.id === custId);
  if (customer) {
    _currentCustomer = customer;
    title.textContent = customer.name;
    body.innerHTML = renderCustomerDetail(customer);
  }
}

function renderCustomerDetail(c) {
  return `
    <div style="padding: var(--spacing-5);">
      <div class="flex items-center gap-4" style="margin-bottom: var(--spacing-5);">
        <div class="customer-avatar" style="width:56px;height:56px;font-size:var(--text-xl);">${esc(getInitials(c.name))}</div>
        <div>
          <div class="text-xl font-bold">${esc(c.name)}</div>
          ${c.phone ? `<div class="text-sm text-muted">📞 ${esc(c.phone)}</div>` : ""}
          ${c.address ? `<div class="text-sm text-muted">📍 ${esc(c.address)}</div>` : ""}
        </div>
      </div>
      <div class="form-grid form-grid-2" style="gap: var(--spacing-3); margin-bottom: var(--spacing-4);">
        <div class="stat-card">
          <div class="stat-card-label">Total Bills</div>
          <div class="stat-card-value">${c.totalBills || 0}</div>
        </div>
        <div class="stat-card">
          <div class="stat-card-label">Total Bill Value</div>
          <div class="stat-card-value" style="font-size:var(--text-lg);">${formatCurrency(c.totalBillValue || 0)}</div>
        </div>
        <div class="stat-card">
          <div class="stat-card-label">Total Quantity</div>
          <div class="stat-card-value">${formatQuantity(c.totalQuantityTons || 0)} <span style="font-size:var(--text-sm);font-weight:400;">tons</span></div>
        </div>
        <div class="stat-card">
          <div class="stat-card-label" style="color:var(--clr-success-700)">Commission Earned</div>
          <div class="stat-card-value" style="font-size:var(--text-lg);color:var(--clr-success-600);">${formatCurrency(c.totalCommission || 0)}</div>
        </div>
      </div>
      ${c.notes ? `<div class="text-sm text-secondary"><span class="font-semibold">Notes:</span> ${esc(c.notes)}</div>` : ""}
    </div>
  `;
}

async function handleDeleteCustomer() {
  if (!_currentCustomer) return;
  const confirmed = await confirm(`Delete "${_currentCustomer.name}"?\n\nHistorical bills will be preserved with the customer's saved details.`);
  if (!confirmed) return;
  try {
    await deleteCustomer(_currentCustomer.id);
    toast("success", "Customer deleted");
    closeDetailModal();
    _lastDocs = [];
    loadCustomers(null);
  } catch (err) {
    toast("error", err.message || "Delete failed");
  }
}

function closeDetailModal() {
  document.getElementById("customer-detail-modal").classList.add("hidden");
  _currentCustomer = null;
}

// ─── UI Helpers ───────────────────────────────────────────────────────────
function showLoading() {
  document.getElementById("customers-loading").classList.remove("hidden");
  document.getElementById("customers-empty").classList.add("hidden");
  document.getElementById("customers-table-container").classList.add("hidden");
  document.getElementById("customers-pagination").classList.add("hidden");
}

function showEmpty(msg) {
  document.getElementById("customers-loading").classList.add("hidden");
  document.getElementById("customers-table-container").classList.add("hidden");
  document.getElementById("customers-pagination").classList.add("hidden");
  const el = document.getElementById("customers-empty");
  el.classList.remove("hidden");
  if (msg) el.querySelector(".empty-state-description").textContent = msg;
}

function toast(type, message) {
  const c = document.getElementById("toast-container");
  if (!c) return;
  const t = document.createElement("div");
  t.className = `toast toast-${type}`;
  t.innerHTML = `<div class="toast-body"><div class="toast-title">${esc(message)}</div></div>`;
  c.appendChild(t);
  setTimeout(() => { t.style.opacity="0"; setTimeout(()=>t.remove(),300); }, 4000);
}

function esc(s) {
  if (!s) return "";
  return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}
