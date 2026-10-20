/**
 * dashboard-page.js — Dashboard page controller
 */

import { initTheme, loadSettings, toggleTheme, getCurrentTheme } from "../services/settings-service.js";
import { initFirebase, isFirebaseConfigured } from "../firebase-init.js";
import { getGlobalTotals, getDateRangeTotals, getTopCustomers } from "../services/dashboard-service.js";
import { getRecentBills } from "../services/bill-service.js";
import { formatCurrency, formatQuantity, formatDate, todayInputDate } from "../modules/formatting.js";
import { printReceipt } from "../modules/pdf-generator.js";
import { generateBillPdf } from "../modules/pdf-generator.js";

initTheme();
document.addEventListener("DOMContentLoaded", async () => {
  initFirebase();
  setupNav();
  setupThemeToggle();
  setupNetworkMonitor();

  const settings = await loadSettings();
  document.querySelectorAll("[data-biz-name]").forEach(el => {
    if (settings.businessName) el.textContent = settings.businessName;
  });

  setupPeriodButtons();
  setupCustomDateRange();
  document.getElementById("refresh-btn")?.addEventListener("click", () => loadDashboard("all"));

  // Load dashboard data (not loaded at startup — only when page is opened)
  await loadDashboard("month");
});

// ─── Nav ──────────────────────────────────────────────────────────────────
function setupNav() {
  document.querySelectorAll(".nav-link, .bottom-nav-link").forEach(link => {
    if (link.getAttribute("href")?.includes("dashboard")) {
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

// ─── Period Buttons ────────────────────────────────────────────────────────
function setupPeriodButtons() {
  document.querySelectorAll("[data-period]").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("[data-period]").forEach(b => b.classList.replace("btn-primary", "btn-secondary"));
      btn.classList.replace("btn-secondary", "btn-primary");
      loadDashboard(btn.dataset.period);
    });
  });
}

function setupCustomDateRange() {
  document.getElementById("dash-custom-btn")?.addEventListener("click", () => {
    const from = document.getElementById("dash-from")?.value;
    const to   = document.getElementById("dash-to")?.value;
    if (!from || !to) { toast("warning", "Select both dates"); return; }
    loadDashboard("custom", from, to);
  });
}

// ─── Date Range Calculation ────────────────────────────────────────────────
function getDateRange(period) {
  const today = new Date();
  const pad   = n => String(n).padStart(2, "0");
  const fmt   = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;

  const todayStr = fmt(today);

  if (period === "today") {
    return { from: todayStr, to: todayStr };
  }
  if (period === "week") {
    const start = new Date(today);
    start.setDate(today.getDate() - today.getDay());
    return { from: fmt(start), to: todayStr };
  }
  if (period === "month") {
    const start = new Date(today.getFullYear(), today.getMonth(), 1);
    return { from: fmt(start), to: todayStr };
  }
  if (period === "year") {
    const start = new Date(today.getFullYear(), 0, 1);
    return { from: fmt(start), to: todayStr };
  }
  return null; // "all" → use global aggregates
}

// ─── Load Dashboard ────────────────────────────────────────────────────────
async function loadDashboard(period, customFrom, customTo) {
  if (!isFirebaseConfigured()) {
    setStats({ totalBills: "N/A", totalQuantityTons: "N/A", totalBillValue: "—", totalCommission: "—" });
    renderRecentBills([]);
    renderTopCustomers([]);
    return;
  }

  setStatsLoading();

  try {
    let stats;
    if (period === "all") {
      stats = await getGlobalTotals();
    } else if (period === "custom") {
      stats = await getDateRangeTotals(customFrom, customTo);
    } else {
      const range = getDateRange(period);
      if (range) {
        stats = await getDateRangeTotals(range.from, range.to);
      } else {
        stats = await getGlobalTotals();
      }
    }
    setStats(stats);
  } catch (err) {
    console.error("[Dashboard] Stats error:", err);
    setStats({ totalBills: "Err", totalQuantityTons: "Err", totalBillValue: "—", totalCommission: "—" });
  }

  // Load recent bills
  try {
    const recent = await getRecentBills(8);
    renderRecentBills(recent);
  } catch (err) {
    renderRecentBills([], err.message);
  }

  // Load top customers
  try {
    const top = await getTopCustomers(5);
    renderTopCustomers(top);
  } catch (err) {
    renderTopCustomers([], err.message);
  }
}

// ─── Stats Rendering ──────────────────────────────────────────────────────
function setStatsLoading() {
  ["stat-total-bills","stat-total-qty","stat-total-bill","stat-total-comm"].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.textContent = "…"; el.classList.add("skeleton"); }
  });
}

function setStats(stats) {
  const set = (id, val) => {
    const el = document.getElementById(id);
    if (el) { el.textContent = val; el.classList.remove("skeleton"); }
  };
  set("stat-total-bills", stats.totalBills ?? "—");
  set("stat-total-qty",   typeof stats.totalQuantityTons === "number"
    ? formatQuantity(stats.totalQuantityTons) : (stats.totalQuantityTons || "—"));
  set("stat-total-bill",  typeof stats.totalBillValue === "number"
    ? formatCurrency(stats.totalBillValue) : "—");
  set("stat-total-comm",  typeof stats.totalCommission === "number"
    ? formatCurrency(stats.totalCommission) : "—");
}

// ─── Recent Bills ──────────────────────────────────────────────────────────
function renderRecentBills(bills, errMsg) {
  const container = document.getElementById("recent-bills-container");
  if (!container) return;

  if (errMsg || !bills.length) {
    container.innerHTML = `<div class="empty-state" style="padding:var(--spacing-6);"><p class="empty-state-description">${esc(errMsg || "No bills yet. Create your first bill.")}</p></div>`;
    return;
  }

  container.innerHTML = `
    <div class="table-container" style="border:none;border-radius:0;">
      <table class="table">
        <thead><tr>
          <th>Bill No.</th><th>Date</th><th>Customer</th>
          <th class="text-right">Total Bill</th>
          <th class="text-right hide-mobile">Commission</th>
        </tr></thead>
        <tbody>
          ${bills.map(b => `
            <tr style="cursor:pointer;" onclick="location.href='bills.html'">
              <td><span class="badge badge-blue font-mono" style="font-size:11px;">${esc(b.billNumber||"—")}</span></td>
              <td class="text-sm">${esc(formatDate(b.billDate))}</td>
              <td class="text-sm font-medium">${esc(b.customerNameSnapshot||"—")}</td>
              <td class="text-right currency-cell text-sm font-semibold">${esc(formatCurrency(b.totalBill||0))}</td>
              <td class="text-right hide-mobile" style="color:var(--clr-success-600);font-size:var(--text-xs);font-family:var(--font-mono);">${esc(formatCurrency(b.totalCommission||0))}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

// ─── Top Customers ─────────────────────────────────────────────────────────
function renderTopCustomers(customers, errMsg) {
  const container = document.getElementById("top-customers-container");
  if (!container) return;

  if (errMsg || !customers.length) {
    container.innerHTML = `<div class="empty-state" style="padding:var(--spacing-6);"><p class="empty-state-description">${esc(errMsg || "No customer data yet.")}</p></div>`;
    return;
  }

  const max = Math.max(...customers.map(c => c.totalBillValue || 0), 1);

  container.innerHTML = `
    <div style="padding: var(--spacing-4);">
      ${customers.map((c, i) => `
        <div class="flex items-center gap-3" style="margin-bottom: var(--spacing-3);">
          <div style="width:24px;text-align:center;font-weight:700;color:var(--text-muted);font-size:var(--text-sm);">${i+1}</div>
          <div style="flex:1;min-width:0;">
            <div class="flex justify-between items-baseline" style="margin-bottom:4px;">
              <span class="text-sm font-medium truncate">${esc(c.name)}</span>
              <span class="text-xs font-mono text-muted" style="flex-shrink:0;margin-left:8px;">${esc(formatCurrency(c.totalBillValue||0))}</span>
            </div>
            <div style="height:6px;background:var(--border-default);border-radius:999px;overflow:hidden;">
              <div style="height:100%;width:${Math.round(((c.totalBillValue||0)/max)*100)}%;background:var(--clr-primary-500);border-radius:999px;transition:width 0.6s ease;"></div>
            </div>
          </div>
          <div class="text-xs text-muted" style="flex-shrink:0;">${c.totalBills||0} bills</div>
        </div>
      `).join("")}
    </div>
  `;
}

function toast(type, msg) {
  const c = document.getElementById("toast-container");
  if (!c) return;
  const t = document.createElement("div");
  t.className = `toast toast-${type}`;
  t.innerHTML = `<div class="toast-body"><div class="toast-title">${esc(msg)}</div></div>`;
  c.appendChild(t);
  setTimeout(() => t.remove(), 4000);
}

function esc(s) {
  if (!s) return "";
  return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}
