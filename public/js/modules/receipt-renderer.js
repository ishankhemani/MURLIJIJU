/**
 * receipt-renderer.js
 *
 * Premium digital receipt — matches the structure of a traditional
 * Indian commission agent bill but with a clean modern UI.
 *
 * Layout (matching the physical bill reference):
 *   ┌─────────────────────────────────────────────┐
 *   │ BUSINESS NAME          Address / Phone       │
 *   │ Canvassing Agents                            │
 *   ├══════════════════════════════════════════════│
 *   │ Bill No. ___          Date: ___              │
 *   │ M/s  [Customer Name]                         │
 *   ├──────────────────────────────────────────────│
 *   │ Particular │ Tons │ Qtls │  Rate  │  Comm.  │
 *   │ ───────────│──────│──────│────────│─────────│
 *   │ [data row]                                   │
 *   ├──────────────────────────────────────────────│
 *   │              ┌──────────────┬──────────────┐ │
 *   │              │ Total Bill ₹ │ Commission ₹ │ │
 *   │              └──────────────┴──────────────┘ │
 *   ├──────────────────────────────────────────────│
 *   │ Bank Details              For: Business      │
 *   │ E.&O.E.                                      │
 *   └─────────────────────────────────────────────┘
 */

import { formatCurrency, formatQuantity, formatDate } from "./formatting.js";

// ─── Full Receipt (complete HTML document) ─────────────────────────────────

/**
 * Render a complete, self-contained receipt HTML document.
 * @param {object} bill
 * @param {object} [options]
 * @param {boolean} [options.isDraft=false]
 * @returns {string} Full HTML document string
 */
export function renderReceipt(bill, options = {}) {
  const { isDraft = false } = options;

  const biz     = x(bill.businessNameSnapshot)    || "MK Canvassing";
  const addr    = x(bill.businessAddressSnapshot) || "";
  const phone   = x(bill.businessContactSnapshot) || "";
  const bank    = x(bill.bankDetails)             || "";
  const billNo  = x(bill.billNumber)  || (isDraft ? "DRAFT" : "—");
  const date    = formatDate(bill.billDate);
  const cust    = x(bill.customerNameSnapshot)    || "—";
  const custPh  = x(bill.customerPhoneSnapshot)   || "";
  const partic  = x(bill.particular)              || "—";
  const tons    = bill.quantityTons      || 0;
  const qtls    = bill.quantityQuintals  || 0;
  const rate    = bill.ratePerQuintal    || 0;
  const comm    = bill.commissionPerQuintal || 0;
  const total   = bill.totalBill         || 0;
  const totalC  = bill.totalCommission   || 0;
  const remarks = x(bill.remarks)        || "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Bill ${esc(billNo)} — ${esc(biz)}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  html, body {
    background: #e8e4da;
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    font-size: 13px;
    color: #1a1a2e;
    line-height: 1.5;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  /* ── Paper ─────────────────────────────────────────────────────────── */
  .paper {
    position: relative;
    max-width: 210mm;
    margin: 24px auto;
    background: #ffffff;
    border-radius: 4px;
    box-shadow: 0 4px 6px rgba(0,0,0,.07), 0 20px 60px rgba(0,0,0,.12);
    overflow: hidden;
  }

  /* ── Draft watermark ───────────────────────────────────────────────── */
  .draft-mark {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    pointer-events: none;
    z-index: 0;
  }
  .draft-mark-text {
    font-size: 100px;
    font-weight: 900;
    color: rgba(200,0,0,0.05);
    transform: rotate(-30deg);
    letter-spacing: 8px;
    user-select: none;
    white-space: nowrap;
  }

  .paper > * { position: relative; z-index: 1; }

  /* ── Top accent bar ────────────────────────────────────────────────── */
  .accent-bar {
    height: 6px;
    background: linear-gradient(90deg, #1a1a2e 0%, #c9a227 40%, #e8c547 60%, #c9a227 80%, #1a1a2e 100%);
  }

  /* ══════════════════════════════════════════════════════════════════════
     HEADER
  ══════════════════════════════════════════════════════════════════════ */
  .header {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 16px;
    align-items: start;
    padding: 24px 28px 18px;
    border-bottom: 2.5px solid #1a1a2e;
  }

  .biz-name {
    font-size: 28px;
    font-weight: 900;
    letter-spacing: -0.5px;
    color: #1a1a2e;
    line-height: 1;
    text-transform: uppercase;
  }
  .biz-tagline {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 3px;
    color: #c9a227;
    text-transform: uppercase;
    margin-top: 5px;
  }

  .header-right {
    text-align: right;
    font-size: 11.5px;
    color: #444;
    line-height: 1.7;
  }
  .header-right strong {
    display: block;
    color: #1a1a2e;
    font-weight: 600;
    font-size: 12px;
  }

  /* ══════════════════════════════════════════════════════════════════════
     META ROW (Bill No + Date)
  ══════════════════════════════════════════════════════════════════════ */
  .meta-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 28px;
    background: #f8f7f4;
    border-bottom: 1px solid #e5e1d8;
  }
  .meta-billno {
    font-size: 13px;
    color: #555;
  }
  .meta-billno-val {
    font-size: 22px;
    font-weight: 900;
    color: #c0392b;
    letter-spacing: 0.5px;
    margin-left: 8px;
    font-variant-numeric: tabular-nums;
  }
  .meta-date {
    font-size: 13px;
    color: #555;
    text-align: right;
  }
  .meta-date-val {
    font-weight: 700;
    color: #1a1a2e;
    font-size: 13.5px;
    margin-left: 6px;
  }

  /* ══════════════════════════════════════════════════════════════════════
     CUSTOMER ROW
  ══════════════════════════════════════════════════════════════════════ */
  .customer-section {
    padding: 14px 28px 12px;
    border-bottom: 1.5px solid #1a1a2e;
  }
  .ms-label {
    font-size: 11px;
    font-weight: 700;
    color: #888;
    text-transform: uppercase;
    letter-spacing: 1.5px;
    margin-bottom: 3px;
  }
  .customer-name {
    font-size: 20px;
    font-weight: 800;
    color: #1a1a2e;
    line-height: 1.2;
    border-bottom: 2px solid #c9a227;
    display: inline-block;
    padding-bottom: 2px;
  }
  .customer-phone {
    font-size: 12px;
    color: #777;
    margin-top: 4px;
    margin-left: 2px;
  }

  /* ══════════════════════════════════════════════════════════════════════
     DETAILS TABLE
  ══════════════════════════════════════════════════════════════════════ */
  .details-table {
    width: 100%;
    border-collapse: collapse;
  }

  .details-table thead th {
    background: #1a1a2e;
    color: #ffffff;
    font-size: 10.5px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.8px;
    padding: 10px 14px;
    text-align: left;
    white-space: nowrap;
    border-right: 1px solid rgba(255,255,255,0.1);
  }
  .details-table thead th:last-child { border-right: none; }
  .details-table thead th.num { text-align: right; }

  .details-table tbody td {
    padding: 14px 14px;
    border-bottom: 1px solid #eee;
    border-right: 1px solid #f0ece3;
    font-size: 13px;
    vertical-align: middle;
  }
  .details-table tbody td:last-child { border-right: none; }
  .details-table tbody tr:last-child td { border-bottom: none; }

  .td-particular {
    font-weight: 700;
    font-size: 14px;
    color: #1a1a2e;
  }
  .td-num {
    text-align: right;
    font-variant-numeric: tabular-nums;
    font-weight: 600;
    font-family: 'Inter', monospace;
    color: #333;
  }
  .td-rate  { color: #1a1a2e; }
  .td-comm  { color: #15803d; font-weight: 700; }

  /* Spacer rows to match the blank rows in physical bill */
  .details-table tbody .spacer td {
    height: 36px;
    background: #fafaf8;
  }

  /* ══════════════════════════════════════════════════════════════════════
     TOTALS
  ══════════════════════════════════════════════════════════════════════ */
  .totals-section {
    display: flex;
    justify-content: flex-end;
    padding: 0 0 0 0;
    border-top: 1.5px solid #1a1a2e;
  }
  .totals-box {
    display: flex;
    min-width: 0;
    width: 100%;
  }
  .total-bill-box {
    flex: 3;
    background: #1a1a2e;
    padding: 16px 20px;
    display: flex;
    flex-direction: column;
    justify-content: center;
  }
  .total-bill-label {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 1.5px;
    color: #c9a227;
    margin-bottom: 4px;
  }
  .total-bill-value {
    font-size: 26px;
    font-weight: 900;
    color: #ffffff;
    font-variant-numeric: tabular-nums;
    letter-spacing: -0.5px;
  }
  .total-comm-box {
    flex: 2;
    background: #15803d;
    padding: 16px 20px;
    display: flex;
    flex-direction: column;
    justify-content: center;
    border-left: 2px solid rgba(255,255,255,0.2);
  }
  .total-comm-label {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 1.5px;
    color: #bbf7d0;
    margin-bottom: 4px;
  }
  .total-comm-value {
    font-size: 22px;
    font-weight: 900;
    color: #ffffff;
    font-variant-numeric: tabular-nums;
  }

  /* Breakdown note */
  .calc-note {
    padding: 8px 28px;
    font-size: 10.5px;
    color: #999;
    border-top: 1px solid #f0ece3;
    display: flex;
    gap: 20px;
    flex-wrap: wrap;
  }

  /* ══════════════════════════════════════════════════════════════════════
     REMARKS
  ══════════════════════════════════════════════════════════════════════ */
  .remarks-box {
    margin: 0 28px 10px;
    padding: 10px 14px;
    background: #fffbf0;
    border-left: 3px solid #c9a227;
    border-radius: 0 4px 4px 0;
    font-size: 12px;
    color: #444;
  }
  .remarks-label {
    font-size: 9.5px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: #c9a227;
    margin-bottom: 3px;
  }

  /* ══════════════════════════════════════════════════════════════════════
     FOOTER
  ══════════════════════════════════════════════════════════════════════ */
  .footer {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    padding: 14px 28px 20px;
    border-top: 1px dashed #ccc;
    margin-top: 8px;
    flex-wrap: wrap;
    gap: 12px;
  }
  .footer-bank {
    font-size: 11.5px;
    color: #444;
    line-height: 1.8;
  }
  .footer-bank strong {
    font-weight: 700;
    color: #1a1a2e;
  }
  .footer-eo {
    font-size: 10.5px;
    color: #aaa;
    font-style: italic;
    margin-top: 6px;
  }
  .footer-sig {
    text-align: center;
    min-width: 140px;
  }
  .sig-space {
    height: 40px;
  }
  .sig-line {
    border-top: 1.5px solid #1a1a2e;
    padding-top: 6px;
    font-size: 12px;
    font-weight: 700;
    color: #1a1a2e;
  }
  .sig-sub {
    font-size: 9.5px;
    color: #999;
    margin-top: 2px;
    text-transform: uppercase;
    letter-spacing: 0.8px;
  }

  /* ── Bottom accent bar ─────────────────────────────────────────────── */
  .bottom-bar {
    height: 6px;
    background: linear-gradient(90deg, #1a1a2e 0%, #c9a227 40%, #e8c547 60%, #c9a227 80%, #1a1a2e 100%);
  }

  /* ── Print ──────────────────────────────────────────────────────────── */
  @media print {
    html, body { background: white; }
    .paper { margin: 0; box-shadow: none; max-width: 100%; border-radius: 0; }
    @page { margin: 8mm; size: A4; }
  }

  /* ── Mobile ──────────────────────────────────────────────────────────── */
  @media (max-width: 580px) {
    .header { grid-template-columns: 1fr; }
    .header-right { text-align: left; margin-top: 8px; }
    .biz-name { font-size: 22px; }
    .total-bill-value { font-size: 20px; }
    .total-comm-value { font-size: 18px; }
    .meta-row { flex-direction: column; align-items: flex-start; gap: 4px; }
  }
</style>
</head>
<body>
<div class="paper">
  ${isDraft ? `<div class="draft-mark"><div class="draft-mark-text">DRAFT</div></div>` : ""}

  <div class="accent-bar"></div>

  <!-- ══ HEADER ══ -->
  <div class="header">
    <div>
      <div class="biz-name">${esc(biz)}</div>
      <div class="biz-tagline">Canvassing Agents</div>
    </div>
    <div class="header-right">
      ${addr ? `<strong>${esc(addr).replace(/,\s*/g,"<br>")}</strong>` : ""}
      ${phone ? `<span>${esc(phone).replace(/[,;]\s*/g,"<br>")}</span>` : ""}
    </div>
  </div>

  <!-- ══ META ROW ══ -->
  <div class="meta-row">
    <div>
      <span class="meta-billno">Bill No.</span>
      <span class="meta-billno-val">${esc(billNo)}</span>
    </div>
    <div class="meta-date">
      Date<span class="meta-date-val">${esc(date)}</span>
    </div>
  </div>

  <!-- ══ CUSTOMER ══ -->
  <div class="customer-section">
    <div class="ms-label">M / s</div>
    <div class="customer-name">${esc(cust)}</div>
    ${custPh ? `<div class="customer-phone">📞 ${esc(custPh)}</div>` : ""}
  </div>

  <!-- ══ DETAILS TABLE ══ -->
  <table class="details-table">
    <thead>
      <tr>
        <th style="width:30%">Particular</th>
        <th class="num" style="width:13%">Qty (Tons)</th>
        <th class="num" style="width:15%">Qty (Qtls)</th>
        <th class="num" style="width:17%">Rate / Qtl</th>
        <th class="num" style="width:15%">Comm. / Qtl</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td class="td-particular">${esc(partic)}</td>
        <td class="td-num td-rate">${esc(formatQuantity(tons))}</td>
        <td class="td-num td-rate">${esc(formatQuantity(qtls))}</td>
        <td class="td-num td-rate">₹ ${esc(formatQuantity(rate))}</td>
        <td class="td-num td-comm">₹ ${esc(formatQuantity(comm))}</td>
      </tr>
      <!-- blank rows for visual breathing room (like physical bill) -->
      <tr class="spacer"><td colspan="5"></td></tr>
      <tr class="spacer"><td colspan="5"></td></tr>
    </tbody>
  </table>

  <!-- ══ TOTALS ══ -->
  <div class="totals-section">
    <div class="totals-box">
      <div class="total-bill-box">
        <div class="total-bill-label">Total Bill Value</div>
        <div class="total-bill-value">${esc(formatCurrency(total))}</div>
      </div>
      <div class="total-comm-box">
        <div class="total-comm-label">Commission</div>
        <div class="total-comm-value">${esc(formatCurrency(totalC))}</div>
      </div>
    </div>
  </div>

  <!-- Calculation note -->
  <div class="calc-note">
    <span>Qty: ${esc(formatQuantity(tons))} ton × 10 = ${esc(formatQuantity(qtls))} qtl</span>
    <span>Bill: ${esc(formatQuantity(qtls))} × ₹${esc(formatQuantity(rate))} = ${esc(formatCurrency(total))}</span>
    <span>Comm: ${esc(formatQuantity(qtls))} × ₹${esc(formatQuantity(comm))} = ${esc(formatCurrency(totalC))}</span>
  </div>

  ${remarks ? `
  <div class="remarks-box">
    <div class="remarks-label">Remarks</div>
    <div>${esc(remarks)}</div>
  </div>` : ""}

  <!-- ══ FOOTER ══ -->
  <div class="footer">
    <div class="footer-bank">
      ${bank
        ? bank.split(/\n/).map(l => `<div>${esc(l)}</div>`).join("")
        : ""}
      <div class="footer-eo">E. &amp; O.E.</div>
    </div>
    <div class="footer-sig">
      <div class="sig-space"></div>
      <div class="sig-line">For: ${esc(biz)}</div>
      <div class="sig-sub">Authorised Signatory</div>
    </div>
  </div>

  <div class="bottom-bar"></div>
</div>
</body>
</html>`;
}

// ─── Inline Preview (for bill form panel) ──────────────────────────────────

/**
 * Render a compact live preview inside the bill form.
 * @param {object} billData  – partial data from the form (not yet saved)
 * @param {object} settings  – business settings
 * @returns {string} HTML fragment
 */
export function renderBillPreview(billData, settings = {}) {
  const biz   = settings.businessName || "MK Canvassing";
  const tons  = billData.quantityTons            || 0;
  const qtls  = billData.quantityQuintals        || 0;
  const rate  = billData.ratePerQuintal          || 0;
  const comm  = billData.commissionPerQuintal    || 0;
  const total = billData.totalBill               || 0;
  const totalC= billData.totalCommission         || 0;
  const date  = formatDate(billData.billDate);
  const cust  = billData.customerName            || "—";
  const partic= billData.particular              || "—";
  const bn    = billData.billNumber              || "";

  return `
  <div style="font-family:'Inter',-apple-system,sans-serif;border:2px solid #1a1a2e;border-radius:6px;overflow:hidden;background:#fff;">

    <!-- Top bar -->
    <div style="height:4px;background:linear-gradient(90deg,#1a1a2e,#c9a227,#e8c547,#c9a227,#1a1a2e);"></div>

    <!-- Header -->
    <div style="padding:12px 16px 10px;border-bottom:2px solid #1a1a2e;">
      <div style="font-size:16px;font-weight:900;color:#1a1a2e;text-transform:uppercase;letter-spacing:-0.3px;">${esc(biz)}</div>
      <div style="font-size:9px;font-weight:700;letter-spacing:3px;color:#c9a227;text-transform:uppercase;margin-top:2px;">Canvassing Agents</div>
    </div>

    <!-- Meta -->
    <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 16px;background:#f8f7f4;border-bottom:1px solid #e5e1d8;">
      <div>
        <span style="font-size:11px;color:#777;">Bill No.</span>
        <span style="font-size:16px;font-weight:900;color:#c0392b;margin-left:6px;">${esc(bn || "—")}</span>
      </div>
      <div style="font-size:11px;color:#555;">
        <span style="color:#777;">Date</span>
        <span style="font-weight:700;color:#1a1a2e;margin-left:4px;">${esc(date) || "—"}</span>
      </div>
    </div>

    <!-- Customer -->
    <div style="padding:10px 16px 8px;border-bottom:1.5px solid #1a1a2e;">
      <div style="font-size:9px;font-weight:700;letter-spacing:1.5px;color:#aaa;text-transform:uppercase;margin-bottom:2px;">M / s</div>
      <div style="font-size:15px;font-weight:800;color:#1a1a2e;border-bottom:2px solid #c9a227;display:inline-block;padding-bottom:1px;">${esc(cust)}</div>
    </div>

    <!-- Table -->
    <table style="width:100%;border-collapse:collapse;font-size:11px;">
      <thead>
        <tr>
          <th style="background:#1a1a2e;color:#fff;padding:7px 10px;text-align:left;font-weight:700;font-size:9px;text-transform:uppercase;letter-spacing:.6px;">Particular</th>
          <th style="background:#1a1a2e;color:#fff;padding:7px 8px;text-align:right;font-weight:700;font-size:9px;text-transform:uppercase;letter-spacing:.6px;">Tons</th>
          <th style="background:#1a1a2e;color:#fff;padding:7px 8px;text-align:right;font-weight:700;font-size:9px;text-transform:uppercase;letter-spacing:.6px;">Qtls</th>
          <th style="background:#1a1a2e;color:#fff;padding:7px 8px;text-align:right;font-weight:700;font-size:9px;text-transform:uppercase;letter-spacing:.6px;">Rate</th>
          <th style="background:#1a1a2e;color:#fff;padding:7px 8px;text-align:right;font-weight:700;font-size:9px;text-transform:uppercase;letter-spacing:.6px;color:#86efac;">Comm.</th>
        </tr>
      </thead>
      <tbody>
        <tr style="background:#fff;">
          <td style="padding:10px 10px;font-weight:700;font-size:13px;color:#1a1a2e;border-bottom:1px solid #eee;">${esc(partic)}</td>
          <td style="padding:10px 8px;text-align:right;font-variant-numeric:tabular-nums;font-weight:600;border-bottom:1px solid #eee;">${esc(formatQuantity(tons))}</td>
          <td style="padding:10px 8px;text-align:right;font-variant-numeric:tabular-nums;font-weight:600;border-bottom:1px solid #eee;">${esc(formatQuantity(qtls))}</td>
          <td style="padding:10px 8px;text-align:right;font-variant-numeric:tabular-nums;font-weight:600;border-bottom:1px solid #eee;">₹${esc(formatQuantity(rate))}</td>
          <td style="padding:10px 8px;text-align:right;font-variant-numeric:tabular-nums;font-weight:700;color:#15803d;border-bottom:1px solid #eee;">₹${esc(formatQuantity(comm))}</td>
        </tr>
      </tbody>
    </table>

    <!-- Totals -->
    <div style="display:flex;border-top:2px solid #1a1a2e;">
      <div style="flex:3;background:#1a1a2e;padding:12px 14px;">
        <div style="font-size:8.5px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#c9a227;margin-bottom:3px;">Total Bill Value</div>
        <div style="font-size:20px;font-weight:900;color:#fff;font-variant-numeric:tabular-nums;">${esc(formatCurrency(total))}</div>
      </div>
      <div style="flex:2;background:#15803d;padding:12px 14px;border-left:2px solid rgba(255,255,255,.2);">
        <div style="font-size:8.5px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#bbf7d0;margin-bottom:3px;">Commission</div>
        <div style="font-size:17px;font-weight:900;color:#fff;font-variant-numeric:tabular-nums;">${esc(formatCurrency(totalC))}</div>
      </div>
    </div>

    <!-- Bottom bar -->
    <div style="height:4px;background:linear-gradient(90deg,#1a1a2e,#c9a227,#e8c547,#c9a227,#1a1a2e);"></div>
  </div>`;
}

// ─── HTML escape ───────────────────────────────────────────────────────────
export function escHtml(s) {
  if (s === null || s === undefined) return "";
  return String(s)
    .replace(/&/g,"&amp;").replace(/</g,"&lt;")
    .replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
}
function esc(s)  { return escHtml(s); }
function x(s)    { return s ? String(s).trim() : ""; }
