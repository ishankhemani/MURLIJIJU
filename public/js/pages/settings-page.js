/**
 * settings-page.js — Settings page controller
 */

import { initTheme, loadSettings, saveSettings, applyTheme, toggleTheme, getCurrentTheme } from "../services/settings-service.js";
import { initFirebase, isFirebaseConfigured } from "../firebase-init.js";
import { applyFormErrors, clearFormErrors } from "../modules/validation.js";

initTheme();
document.addEventListener("DOMContentLoaded", async () => {
  initFirebase();
  setupNav();
  setupThemeToggle();
  setupNetworkMonitor();

  // Show Firebase status
  const statusBadge = document.getElementById("firebase-status");
  if (statusBadge) {
    if (isFirebaseConfigured()) {
      statusBadge.textContent = "Connected";
      statusBadge.className   = "badge badge-green";
    } else {
      statusBadge.textContent = "Not configured";
      statusBadge.className   = "badge badge-amber";
    }
  }

  // Load and populate settings
  await loadAndPopulate();

  // Wire save
  document.getElementById("save-settings-btn")?.addEventListener("click", handleSave);
  document.getElementById("settings-form")?.addEventListener("submit", e => { e.preventDefault(); handleSave(); });

  // Live theme preview on radio change
  document.querySelectorAll("[name='theme']").forEach(radio => {
    radio.addEventListener("change", () => applyTheme(radio.value));
  });
});

// ─── Nav ──────────────────────────────────────────────────────────────────
function setupNav() {
  document.querySelectorAll(".nav-link, .bottom-nav-link").forEach(link => {
    if (link.getAttribute("href")?.includes("settings")) {
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

// ─── Load & Populate ──────────────────────────────────────────────────────
async function loadAndPopulate() {
  const loading = document.getElementById("settings-loading");
  const form    = document.getElementById("settings-form");

  try {
    const s = await loadSettings();

    const set = (name, val) => {
      const el = form.querySelector(`[name="${name}"]`);
      if (el) el.value = val ?? "";
    };

    set("businessName",              s.businessName);
    set("businessAddress",           s.businessAddress);
    set("phone",                     s.phone);
    set("email",                     s.email);
    set("billPrefix",                s.billPrefix || "BILL");
    set("defaultCommissionPerQuintal", s.defaultCommissionPerQuintal || "");
    set("bankDetails",               s.bankDetails);

    // Theme radio
    const themeVal = s.theme || "light";
    const radio = form.querySelector(`[name="theme"][value="${themeVal}"]`);
    if (radio) radio.checked = true;

    loading.classList.add("hidden");
    form.classList.remove("hidden");

  } catch (err) {
    loading.innerHTML = `<p class="text-danger">Failed to load settings: ${esc(err.message)}</p>`;
  }
}

// ─── Save ─────────────────────────────────────────────────────────────────
async function handleSave() {
  const form = document.getElementById("settings-form");
  const btn  = document.getElementById("save-settings-btn");
  const btn2 = document.getElementById("save-settings-btn-bottom");

  clearFormErrors(form);

  const get = (name) => {
    const el = form.querySelector(`[name="${name}"]`);
    return el ? el.value.trim() : "";
  };

  const prefix = get("billPrefix").toUpperCase().replace(/[^A-Z0-9\-_]/g, "") || "BILL";
  const defaultComm = parseFloat(get("defaultCommissionPerQuintal")) || 0;
  const theme = form.querySelector("[name='theme']:checked")?.value || "light";

  // Validate
  const errors = {};
  if (prefix.length > 10) errors.billPrefix = "Prefix must be ≤ 10 characters";
  if (defaultComm < 0) errors.defaultCommissionPerQuintal = "Commission cannot be negative";
  if (Object.keys(errors).length) {
    applyFormErrors(form, errors);
    return;
  }

  const newSettings = {
    businessName:                get("businessName"),
    businessAddress:             get("businessAddress"),
    phone:                       get("phone"),
    email:                       get("email"),
    billPrefix:                  prefix,
    defaultCommissionPerQuintal: defaultComm,
    bankDetails:                 get("bankDetails"),
    theme
  };

  setSaving(true, btn, btn2);

  try {
    await saveSettings(newSettings);

    // Update business name in nav
    document.querySelectorAll("[data-biz-name]").forEach(el => {
      if (newSettings.businessName) el.textContent = newSettings.businessName;
    });

    toast("success", "Settings saved successfully");
  } catch (err) {
    console.error("[Settings] Save failed:", err);
    toast("error", "Save failed: " + (err.message || "Unknown error"));
  } finally {
    setSaving(false, btn, btn2);
  }
}

function setSaving(saving, ...btns) {
  btns.forEach(btn => {
    if (!btn) return;
    if (saving) {
      btn.disabled = true;
      const span = btn.querySelector(".btn-text");
      if (span) span.textContent = "Saving…";
      else btn.textContent = "Saving…";
    } else {
      btn.disabled = false;
      const span = btn.querySelector(".btn-text");
      if (span) span.textContent = "Save Settings";
      else btn.textContent = "Save Settings";
    }
  });
}

function toast(type, msg) {
  const c = document.getElementById("toast-container");
  if (!c) return;
  const t = document.createElement("div");
  t.className = `toast toast-${type}`;
  t.innerHTML = `<div class="toast-body"><div class="toast-title">${esc(msg)}</div></div>`;
  c.appendChild(t);
  setTimeout(() => { t.style.opacity="0"; setTimeout(()=>t.remove(),300); }, 5000);
}

function esc(s) {
  if (!s) return "";
  return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}
