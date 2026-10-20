/**
 * sw.js — JijuBill Service Worker
 *
 * Strategy: App Shell + Cache First
 * - On install: pre-cache the entire app shell (HTML, CSS, JS, icons)
 * - On fetch: serve from cache instantly, update in background (Stale-While-Revalidate)
 * - Firebase SDK CDN calls: Network-first (always fresh)
 * - Result: App opens INSTANTLY from cache — zero loading delay
 */

const CACHE_NAME    = "jijubill-v1";
const SHELL_ASSETS  = [
  "/index.html",
  "/bills.html",
  "/customers.html",
  "/dashboard.html",
  "/settings.html",
  "/manifest.json",
  "/css/base.css",
  "/css/layout.css",
  "/css/components.css",
  "/css/responsive.css",
  "/css/print.css",
  "/js/app.js",
  "/js/firebase-config.js",
  "/js/firebase-init.js",
  "/js/modules/bill-calculator.js",
  "/js/modules/bill-form.js",
  "/js/modules/formatting.js",
  "/js/modules/local-drafts.js",
  "/js/modules/pdf-generator.js",
  "/js/modules/receipt-renderer.js",
  "/js/modules/validation.js",
  "/js/modules/whatsapp-share.js",
  "/js/pages/bills-page.js",
  "/js/pages/customers-page.js",
  "/js/pages/dashboard-page.js",
  "/js/pages/settings-page.js",
  "/js/services/bill-service.js",
  "/js/services/customer-service.js",
  "/js/services/dashboard-service.js",
  "/js/services/numbering-service.js",
  "/js/services/settings-service.js",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/apple-touch-icon.png",
  "/icons/favicon.ico"
];

// ─── Install: Pre-cache app shell ──────────────────────────────────────────
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting()) // Activate immediately, no waiting
  );
});

// ─── Activate: Clean up old caches ────────────────────────────────────────
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim()) // Take control of all pages immediately
  );
});

// ─── Fetch Strategy ────────────────────────────────────────────────────────
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Skip non-GET requests
  if (event.request.method !== "GET") return;

  // ── Firebase SDK / Firestore / Functions calls → Network only ──────────
  // These must always be fresh; never serve stale Firebase API responses
  if (
    url.hostname.includes("firestore.googleapis.com") ||
    url.hostname.includes("cloudfunctions.net") ||
    url.hostname.includes("firebase.googleapis.com") ||
    url.hostname.includes("identitytoolkit.googleapis.com") ||
    url.hostname.includes("securetoken.googleapis.com")
  ) {
    return; // Let browser handle naturally
  }

  // ── Firebase SDK CDN (gstatic) → Cache then network ────────────────────
  if (url.hostname.includes("gstatic.com") || url.hostname.includes("googleapis.com")) {
    event.respondWith(staleWhileRevalidate(event.request));
    return;
  }

  // ── html2pdf CDN → Cache then network ──────────────────────────────────
  if (url.hostname.includes("cdnjs.cloudflare.com")) {
    event.respondWith(staleWhileRevalidate(event.request));
    return;
  }

  // ── App Shell (HTML, CSS, JS, Icons) → Cache First ─────────────────────
  event.respondWith(cacheFirst(event.request));
});

// ─── Cache Strategies ─────────────────────────────────────────────────────

/**
 * Cache First: Serve from cache immediately if available.
 * Fall back to network if not in cache (first load or new asset).
 */
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    // Offline fallback — return cached index.html for navigation requests
    if (request.mode === "navigate") {
      const fallback = await caches.match("/index.html");
      return fallback || new Response("Offline", { status: 503 });
    }
    return new Response("Offline", { status: 503 });
  }
}

/**
 * Stale While Revalidate: Serve cache instantly, update in background.
 */
async function staleWhileRevalidate(request) {
  const cache    = await caches.open(CACHE_NAME);
  const cached   = await cache.match(request);

  const fetchPromise = fetch(request).then(response => {
    if (response.ok) cache.put(request, response.clone());
    return response;
  }).catch(() => cached);

  return cached || fetchPromise;
}
