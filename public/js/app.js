/**
 * app.js
 * 
 * Application entry point.
 * Responsibilities:
 * - Initialize Firebase
 * - Initialize theme (immediately, before render)
 * - Load and apply settings
 * - Wire up navigation
 * - Monitor network status
 * - Expose toast notification system
 * - Run calculation tests on startup (dev mode)
 */

import { initFirebase, isFirebaseConfigured } from "./firebase-init.js";
import { initTheme, loadSettings, toggleTheme, getCurrentTheme } from "./services/settings-service.js";
import { runCalculationTests } from "./modules/bill-calculator.js";

// ─── Initialize on DOM ready ───────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", async () => {
  // 1. Apply theme immediately (prevents flash)
  initTheme();

  // 2. Initialize Firebase
  initFirebase();

  // 3. Wire up navigation
  initNavigation();

  // 4. Wire up theme toggle
  initThemeToggle();

  // 5. Monitor network status
  initNetworkMonitor();

  // 6. Load settings in background (non-blocking)
  loadSettings().then(settings => {
    updateBusinessNameDisplay(settings.businessName);
  }).catch(err => console.warn("[App] Settings load failed:", err));

  // 7. Run calculation tests in development
  if (location.hostname === "localhost" || location.hostname === "127.0.0.1") {
    console.info("[App] Development mode — running calculation tests...");
    const passed = runCalculationTests();
    if (!passed) {
      console.error("[App] ⚠️ Some calculation tests FAILED — review the engine before deploying");
    } else {
      console.info("[App] ✅ All calculation tests passed");
    }
  }

  // 8. Show firebase unconfigured warning if needed
  if (!isFirebaseConfigured()) {
    showToast({
      type:    "warning",
      title:   "Firebase not configured",
      message: "Update firebase-config.js with your project credentials to enable cloud features.",
      duration: 8000
    });
  }
});

// ─── Navigation ────────────────────────────────────────────────────────────

function initNavigation() {
  const currentPage = location.pathname.split("/").pop() || "index.html";

  // Highlight active nav links
  document.querySelectorAll(".nav-link, .bottom-nav-link").forEach(link => {
    const href = link.getAttribute("href");
    if (!href) return;
    const hrefPage = href.split("/").pop();
    if (
      hrefPage === currentPage ||
      (currentPage === "" && hrefPage === "index.html") ||
      (currentPage === "index.html" && hrefPage === "index.html")
    ) {
      link.classList.add("active");
    }
  });
}

// ─── Theme Toggle ──────────────────────────────────────────────────────────

function initThemeToggle() {
  const btn = document.getElementById("theme-toggle-btn");
  if (!btn) return;

  updateThemeIcon(btn);

  btn.addEventListener("click", () => {
    const newTheme = toggleTheme();
    updateThemeIcon(btn, newTheme);
  });
}

function updateThemeIcon(btn, theme) {
  const current = theme || getCurrentTheme();
  const sunIcon  = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`;
  const moonIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;
  btn.innerHTML      = current === "dark" ? sunIcon : moonIcon;
  btn.title          = current === "dark" ? "Switch to light mode" : "Switch to dark mode";
  btn.setAttribute("aria-label", btn.title);
}

// ─── Network Monitor ───────────────────────────────────────────────────────

function initNetworkMonitor() {
  const banner = document.getElementById("offline-banner");
  if (!banner) return;

  function update() {
    if (navigator.onLine) {
      banner.classList.add("hidden");
    } else {
      banner.classList.remove("hidden");
    }
  }

  window.addEventListener("online",  update);
  window.addEventListener("offline", update);
  update();
}

// ─── Business Name Display ────────────────────────────────────────────────

function updateBusinessNameDisplay(name) {
  const elements = document.querySelectorAll("[data-biz-name]");
  elements.forEach(el => {
    if (name) el.textContent = name;
  });
}

// ─── Toast Notification System ────────────────────────────────────────────

/**
 * Show a toast notification.
 * 
 * @param {object} options
 * @param {"success"|"error"|"warning"|"info"} options.type
 * @param {string} options.title
 * @param {string} [options.message]
 * @param {number} [options.duration=4000] - Auto-dismiss after ms (0 = no auto-dismiss)
 * @returns {HTMLElement} The toast element
 */
export function showToast({ type = "info", title, message = "", duration = 4000 }) {
  const container = document.getElementById("toast-container");
  if (!container) return null;

  const icons = {
    success: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`,
    error:   `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
    warning: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
    info:    `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`
  };

  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.setAttribute("role", "alert");
  toast.setAttribute("aria-live", "polite");
  toast.innerHTML = `
    <span class="toast-icon">${icons[type] || icons.info}</span>
    <div class="toast-body">
      <div class="toast-title">${escHtml(title)}</div>
      ${message ? `<div class="toast-message">${escHtml(message)}</div>` : ""}
    </div>
    <button class="btn-ghost btn-icon" aria-label="Dismiss" style="flex-shrink:0;width:28px;height:28px;" onclick="this.closest('.toast').remove()">
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
    </button>
  `;

  container.appendChild(toast);

  if (duration > 0) {
    setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transform = "translateY(8px)";
      toast.style.transition = "all 0.3s ease";
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }

  return toast;
}

function escHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ─── Global Confirm Dialog ─────────────────────────────────────────────────

/**
 * Show a confirmation dialog.
 * @param {object} options
 * @param {string} options.title
 * @param {string} options.message
 * @param {string} [options.confirmText="Confirm"]
 * @param {string} [options.cancelText="Cancel"]
 * @param {string} [options.danger=true]
 * @returns {Promise<boolean>}
 */
export function showConfirm({ title, message, confirmText = "Confirm", cancelText = "Cancel", danger = true }) {
  return new Promise(resolve => {
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.innerHTML = `
      <div class="modal confirm-dialog" role="dialog" aria-modal="true" aria-label="${escHtml(title)}">
        <div class="modal-body" style="padding-top: var(--spacing-6);">
          <div class="confirm-dialog-icon">
            <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/>
              <line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
          </div>
          <h3 style="margin-bottom: var(--spacing-2);">${escHtml(title)}</h3>
          <p class="text-secondary" style="font-size: var(--text-sm);">${escHtml(message)}</p>
        </div>
        <div class="modal-footer">
          <button id="confirm-cancel-btn" class="btn btn-secondary">${escHtml(cancelText)}</button>
          <button id="confirm-ok-btn" class="btn ${danger ? "btn-danger" : "btn-primary"}">${escHtml(confirmText)}</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const cleanup = (result) => {
      overlay.remove();
      resolve(result);
    };

    overlay.querySelector("#confirm-ok-btn").addEventListener("click",     () => cleanup(true));
    overlay.querySelector("#confirm-cancel-btn").addEventListener("click",  () => cleanup(false));
    overlay.addEventListener("click", e => { if (e.target === overlay) cleanup(false); });

    // Focus the cancel button by default for safety
    requestAnimationFrame(() => {
      overlay.querySelector("#confirm-cancel-btn")?.focus();
    });
  });
}

// Make showToast available globally for non-module scripts
window.showToast   = showToast;
window.showConfirm = showConfirm;
