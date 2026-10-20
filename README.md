# JijuBill — Commission Agent Billing System

A **local-first, mobile-first** billing web application for commission agents.
Built with **Vanilla JavaScript + Firebase Firestore + Cloud Functions**.

---

## Features

| Feature | Details |
|---|---|
| 📄 Create Bills | Instant local calculation — no server round-trip |
| 🔢 Auto Bill Numbering | Atomic sequential numbers via Cloud Functions |
| 🔍 Search Bills | By customer name, bill number, phone, date range |
| 👥 Customer Directory | Full CRUD with bill aggregates |
| 📊 Dashboard | Period stats, recent bills, top customers |
| 🖨️ Print / PDF | Browser print + html2pdf (lazy-loaded) |
| 📲 WhatsApp Share | One-tap bill sharing via wa.me |
| 🌙 Dark Mode | Light / dark / system theme |
| 📵 Offline Drafts | Drafts saved to IndexedDB while offline |
| 🔐 Security | App Check + Cloud Functions (no auth needed) |

---

## Calculation Rules

> ⚠️ These rules are hardcoded in both client and server. **Do not change.**

```
1 ton = 10 quintals

Total Bill       = tons × 10 × rate_per_quintal
Total Commission = tons × 10 × commission_per_quintal

Commission is NEVER added to Total Bill — it is always separate.
```

**Example:** 25 tons at ₹5000/qtl, commission ₹20/qtl
- Quintals: 25 × 10 = 250
- Total Bill: 250 × 5000 = **₹12,50,000.00**
- Commission: 250 × 20 = **₹5,000.00** (separate)

---

## Quick Start

### 1. Clone / Setup

```bash
cd ~/Downloads/jijubill
npm install -g firebase-tools
firebase login
```

### 2. Create Firebase Project

1. Go to [console.firebase.google.com](https://console.firebase.google.com)
2. Create a new project (or use existing)
3. Enable **Firestore Database** (production mode)
4. Enable **App Check** with **reCAPTCHA v3**:
   - Go to App Check → Register app → Web
   - Add your hosting domain + `localhost` to allowed origins
   - Copy the **reCAPTCHA v3 site key**

### 3. Configure Firebase

Edit **`public/js/firebase-config.js`**:

```js
const firebaseConfig = {
  apiKey:             "AIza...",
  authDomain:         "YOUR-PROJECT.firebaseapp.com",
  projectId:          "YOUR-PROJECT-ID",
  storageBucket:      "YOUR-PROJECT.appspot.com",
  messagingSenderId:  "123456789",
  appId:              "1:123...",
  measurementId:      "G-..."          // optional
};

const RECAPTCHA_SITE_KEY = "6L...";   // reCAPTCHA v3 site key for App Check
```

Edit **`.firebaserc`**:
```json
{ "projects": { "default": "YOUR-PROJECT-ID" } }
```

### 4. Deploy Firestore Rules & Indexes

```bash
firebase deploy --only firestore
```

### 5. Install & Deploy Cloud Functions

```bash
cd functions
npm install
cd ..
firebase deploy --only functions
```

### 6. Deploy Frontend

```bash
firebase deploy --only hosting
```

Or deploy everything at once:
```bash
firebase deploy
```

---

## Local Development

Run with the Firebase emulator suite (no cloud needed):

```bash
firebase emulators:start
```

Then open: `http://localhost:5000`

The emulator dashboard is at `http://localhost:4000`

---

## Project Structure

```
jijubill/
├── public/                     # Frontend (Firebase Hosting)
│   ├── index.html              # Create Bill (main screen)
│   ├── bills.html              # Bill History & Search
│   ├── customers.html          # Customer Directory
│   ├── dashboard.html          # Statistics Dashboard
│   ├── settings.html           # Settings
│   ├── css/
│   │   ├── base.css            # Design tokens, typography, themes
│   │   ├── layout.css          # Top nav, bottom nav, shell
│   │   ├── components.css      # Buttons, cards, tables, forms, toasts
│   │   ├── responsive.css      # Mobile-first breakpoints
│   │   └── print.css           # Print/PDF styles
│   └── js/
│       ├── firebase-config.js  # ← EDIT THIS with your credentials
│       ├── firebase-init.js    # Firebase SDK init + App Check
│       ├── app.js              # App entry point, toast, confirm dialog
│       ├── modules/
│       │   ├── bill-calculator.js     # Calculation engine + tests
│       │   ├── bill-form.js           # Create/Edit bill form
│       │   ├── formatting.js          # Indian currency, dates, strings
│       │   ├── local-drafts.js        # IndexedDB draft persistence
│       │   ├── pdf-generator.js       # html2pdf + print fallback
│       │   ├── receipt-renderer.js    # HTML receipt renderer
│       │   ├── validation.js          # Form validation + UI helpers
│       │   └── whatsapp-share.js      # WhatsApp URL + Web Share API
│       └── services/
│           ├── bill-service.js        # Bill CRUD (CF writes, FS reads)
│           ├── customer-service.js    # Customer CRUD + autocomplete
│           ├── dashboard-service.js   # Aggregate stats
│           ├── numbering-service.js   # Idempotency keys
│           └── settings-service.js    # Settings + theme management
│
├── functions/                  # Cloud Functions (Node 18)
│   └── src/
│       ├── index.js            # Function exports
│       ├── bill-operations.js  # createBill, editBill, deleteBill, etc.
│       └── validation.js       # Server-side validation + recalculation
│
├── firestore.rules             # Firestore security rules
├── firestore.indexes.json      # Composite index definitions
├── firebase.json               # Firebase project config
├── .firebaserc                 # Project ID ← EDIT THIS
└── README.md                   # This file
```

---

## Security Architecture

```
Browser → App Check (reCAPTCHA v3) → Cloud Function → Firestore
                                          ↓
                              Server-side validation
                              Server-side recalculation
                              Atomic bill number allocation
                              Idempotency check
                              Aggregate counter update
```

- **No Firebase Authentication** — single-owner app, security via App Check
- **Bill totals are ALWAYS recalculated on the server** — client values are ignored
- **Bill numbers are allocated atomically** using a Firestore transaction
- **Idempotency keys** prevent duplicate bills if the request is retried
- **Firestore rules** allow client reads but reject all direct writes

---

## Firestore Data Model

### `bills/{billId}`
| Field | Type | Notes |
|---|---|---|
| billNumber | string | e.g., "BILL-0042" — server-assigned |
| billDate | string | YYYY-MM-DD |
| billDateTs | number | Unix timestamp (for range queries) |
| customerNameSnapshot | string | Copied at bill time |
| customerNameLower | string | Lowercase (for prefix search) |
| customerPhoneSnapshot | string | |
| customerId | string? | Nullable — customer may be deleted |
| particular | string | Commodity name |
| quantityTons | number | |
| quantityQuintals | number | Server-calculated |
| ratePerQuintal | number | |
| commissionPerQuintal | number | |
| totalBill | number | Server-calculated |
| totalCommission | number | Server-calculated — SEPARATE from bill |
| businessNameSnapshot | string | |
| createdAt | Timestamp | Server timestamp |
| updatedAt | Timestamp | Server timestamp |

### `customers/{customerId}`
| Field | Type | Notes |
|---|---|---|
| name | string | |
| nameLower | string | For prefix search |
| phone | string | |
| address | string | |
| totalBills | number | Aggregate counter |
| totalBillValue | number | Aggregate counter |
| totalCommission | number | Aggregate counter |

### `settings/business`
Business name, address, phone, bill prefix, default commission, theme, bank details.

### `dashboardAggregates/totals`
Pre-computed totals updated atomically on every bill create/edit/delete.

### `counters/billNumber`
Monotonically incrementing counter. **Never decremented.**

---

## Troubleshooting

**"Firebase is not configured"**
→ Edit `public/js/firebase-config.js` with your real credentials.

**Bills save but no bill number appears**
→ Check Cloud Functions are deployed and App Check is enabled.

**PDF doesn't generate**
→ Allow popups, or use the Print button (Ctrl+P) and "Save as PDF".

**Offline message appears**
→ Draft is saved locally. Reconnect to save to cloud.

---

## License

Private use only. All rights reserved.
