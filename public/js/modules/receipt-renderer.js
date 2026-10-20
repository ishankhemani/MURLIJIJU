/**
 * receipt-renderer.js
 * 
 * Renders a PREMIUM digital receipt styled like a professional commission
 * agent bill — inspired by traditional Indian mandi commission receipts.
 *
 * Design: Formal letterhead, ruled table, grain motif borders, bank details.
 */

import { formatCurrency, formatDate, formatQuantity } from "./formatting.js";

// ─── Full Printable Receipt ─────────────────────────────────────────────────

/**
 * Render a complete receipt as an HTML string.
 * @param {object} bill
 * @param {object} [options]
 * @param {boolean} [options.isDraft=false]
 * @returns {string}
 */
export function renderReceipt(bill, options = {}) {
  const { isDraft = false } = options;

  const biz      = bill.businessNameSnapshot    || "Your Business Name";
  const bizAddr  = bill.businessAddressSnapshot || "";
  const bizPhone = bill.businessContactSnapshot || "";
  const billNo   = bill.billNumber  || (isDraft ? "DRAFT" : "—");
  const billDate = formatDate(bill.billDate);
  const customer = bill.customerNameSnapshot  || "—";
  const phone    = bill.customerPhoneSnapshot || "";
  const partic   = bill.particular   || "—";
  const qtyTons  = bill.quantityTons || 0;
  const qtyQ     = bill.quantityQuintals || 0;
  const rate     = bill.ratePerQuintal   || 0;
  const comm     = bill.commissionPerQuintal || 0;
  const totalBill = bill.totalBill        || 0;
  const totalComm = bill.totalCommission  || 0;
  const bankDetails = bill.bankDetails    || "";
  const remarks  = bill.remarks || "";

  return `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Bill ${esc(billNo)} — ${esc(biz)}</title>
<style>
  /* ── Reset ── */
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  /* ── Page ── */
  html, body {
    background: #f0ece3;
    font-family: 'Times New Roman', Times, serif;
    color: #1a1a1a;
    font-size: 12pt;
    line-height: 1.4;
  }

  /* ── Receipt Paper ── */
  .receipt {
    position: relative;
    max-width: 210mm;
    margin: 20px auto;
    background: #fffef9;
    border: 3px double #8b6914;
    box-shadow: 0 8px 40px rgba(0,0,0,0.18);
    overflow: hidden;
  }

  /* ── Grain watermark background ── */
  .receipt::before {
    content: '';
    position: absolute;
    inset: 0;
    background-image:
      radial-gradient(circle at 8% 92%, rgba(212,175,55,0.06) 0%, transparent 50%),
      radial-gradient(circle at 92% 8%, rgba(139,105,20,0.05) 0%, transparent 50%),
      repeating-linear-gradient(
        45deg,
        transparent,
        transparent 30px,
        rgba(212,175,55,0.015) 30px,
        rgba(212,175,55,0.015) 31px
      );
    pointer-events: none;
    z-index: 0;
  }

  .receipt > * { position: relative; z-index: 1; }

  /* ── Draft watermark ── */
  .draft-watermark {
    position: absolute;
    top: 50%; left: 50%;
    transform: translate(-50%,-50%) rotate(-35deg);
    font-size: 96pt;
    font-weight: 900;
    color: rgba(200,0,0,0.06);
    pointer-events: none;
    white-space: nowrap;
    z-index: 0;
    user-select: none;
    letter-spacing: 4px;
  }

  /* ── Gold border strip ── */
  .gold-strip-top {
    height: 8px;
    background: linear-gradient(90deg, #8b6914, #d4af37, #f5d060, #d4af37, #8b6914);
  }
  .gold-strip-bottom {
    height: 8px;
    background: linear-gradient(90deg, #8b6914, #d4af37, #f5d060, #d4af37, #8b6914);
  }

  /* ── Header ── */
  .header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    padding: 18px 24px 14px;
    border-bottom: 2px solid #8b6914;
    gap: 12px;
  }

  .header-logo {
    width: 72px;
    height: 72px;
    flex-shrink: 0;
    border-radius: 8px;
    overflow: hidden;
    border: 2px solid #d4af37;
  }
  .header-logo img { width: 100%; height: 100%; object-fit: cover; }

  .header-center {
    flex: 1;
    text-align: center;
    padding: 0 12px;
  }
  .biz-name {
    font-size: 22pt;
    font-weight: 900;
    letter-spacing: 1.5px;
    color: #7a1f1f;
    text-transform: uppercase;
    line-height: 1.1;
    font-family: 'Georgia', serif;
  }
  .biz-tagline {
    font-size: 10pt;
    letter-spacing: 3px;
    color: #8b6914;
    text-transform: uppercase;
    font-weight: 600;
    margin-top: 3px;
    border-top: 1px solid #d4af37;
    border-bottom: 1px solid #d4af37;
    padding: 2px 0;
    margin: 4px 20px;
  }

  .header-right {
    text-align: right;
    font-size: 8.5pt;
    color: #333;
    line-height: 1.6;
    min-width: 140px;
  }
  .pan-number {
    font-weight: 700;
    font-size: 9pt;
    color: #7a1f1f;
    border: 1px solid #7a1f1f;
    padding: 2px 6px;
    display: inline-block;
    margin-bottom: 4px;
    letter-spacing: 1px;
  }

  /* ── Meta row (Bill no + Date) ── */
  .meta-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 24px;
    background: linear-gradient(to right, #fffbf0, #fff9ec, #fffbf0);
    border-bottom: 1px solid #d4af37;
    font-size: 10pt;
  }
  .meta-item { display: flex; align-items: baseline; gap: 8px; }
  .meta-label { font-weight: 600; color: #555; font-size: 9pt; }
  .meta-value-bill {
    font-size: 16pt;
    font-weight: 900;
    color: #c0392b;
    font-family: 'Georgia', serif;
    letter-spacing: 1px;
  }
  .meta-value-date {
    font-size: 11pt;
    font-weight: 700;
    color: #1a1a1a;
  }

  /* ── Customer row ── */
  .customer-row {
    padding: 6px 24px 8px;
    border-bottom: 2px solid #8b6914;
    display: flex;
    gap: 24px;
    align-items: baseline;
    flex-wrap: wrap;
    font-size: 9.5pt;
  }
  .ms-label { font-weight: 600; color: #555; white-space: nowrap; }
  .customer-name {
    font-size: 13pt;
    font-weight: 800;
    color: #1a1a1a;
    font-family: 'Georgia', serif;
    text-decoration: underline;
    text-decoration-color: #d4af37;
    text-underline-offset: 3px;
  }
  .customer-phone { font-size: 9pt; color: #555; }

  /* ── Details Table ── */
  .details-table {
    width: 100%;
    border-collapse: collapse;
  }
  .details-table th {
    background: #1a1a1a;
    color: #f5d060;
    font-size: 8.5pt;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    padding: 7px 10px;
    border: 1px solid #444;
    text-align: left;
    font-family: Arial, sans-serif;
  }
  .details-table th.text-right { text-align: right; }
  .details-table td {
    padding: 10px 10px;
    border: 1px solid #d0c090;
    font-size: 11pt;
    vertical-align: middle;
  }
  .details-table tbody tr:nth-child(even) td {
    background: rgba(212,175,55,0.05);
  }

  /* ── Totals ── */
  .totals-section {
    display: flex;
    justify-content: flex-end;
    padding: 12px 24px 8px;
    border-top: 2px solid #8b6914;
  }
  .totals-box {
    min-width: 280px;
    border: 2px solid #1a1a1a;
  }
  .total-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 12px;
    border-bottom: 1px solid #ddd;
  }
  .total-row:last-child { border-bottom: none; }
  .total-row-main {
    background: #1a1a1a;
    padding: 10px 12px;
  }
  .total-row-main .total-label { color: #f5d060; font-size: 10pt; font-weight: 700; }
  .total-row-main .total-val   { color: #fff;    font-size: 15pt; font-weight: 900; font-family: 'Courier New', monospace; }
  .total-row-comm { background: #f0fff4; }
  .total-row-comm .total-label { color: #14532d; font-size: 9pt; font-weight: 700; }
  .total-row-comm .total-val   { color: #15803d; font-size: 13pt; font-weight: 900; font-family: 'Courier New', monospace; }
  .total-label { font-size: 9pt; color: #444; font-weight: 600; }
  .total-val   { font-family: 'Courier New', monospace; font-weight: 700; font-size: 11pt; }

  /* ── Qty breakdown ── */
  .qty-note {
    font-size: 8pt;
    color: #888;
    padding: 4px 24px 6px;
    text-align: right;
    font-style: italic;
  }

  /* ── Remarks ── */
  .remarks-section {
    margin: 0 24px 10px;
    padding: 8px 10px;
    border-left: 4px solid #d4af37;
    background: rgba(212,175,55,0.05);
    font-size: 9.5pt;
    color: #444;
  }
  .remarks-label {
    font-size: 8pt;
    font-weight: 700;
    text-transform: uppercase;
    color: #8b6914;
    margin-bottom: 2px;
  }

  /* ── Grain decorative divider ── */
  .grain-divider {
    text-align: center;
    padding: 6px 0;
    color: #d4af37;
    font-size: 16pt;
    letter-spacing: 8px;
    opacity: 0.6;
  }

  /* ── Footer ── */
  .footer {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    padding: 10px 24px 14px;
    border-top: 1px dashed #c0a060;
    font-size: 8.5pt;
    color: #555;
    flex-wrap: wrap;
    gap: 8px;
  }
  .footer-bank {
    flex: 1;
    min-width: 180px;
    font-size: 8.5pt;
    color: #333;
    font-weight: 600;
  }
  .footer-eo { font-style: italic; color: #888; }
  .footer-sig {
    text-align: center;
    min-width: 130px;
  }
  .sig-line {
    border-top: 1px solid #333;
    padding-top: 28px;
    font-size: 9pt;
    font-weight: 700;
    color: #1a1a1a;
  }

  /* ── Print overrides ── */
  @media print {
    html, body { background: white; }
    .receipt { margin: 0; box-shadow: none; max-width: 100%; }
  }

  /* ── Mobile responsive ── */
  @media (max-width: 600px) {
    .header { flex-direction: column; align-items: center; text-align: center; }
    .header-right { text-align: center; }
    .biz-name { font-size: 16pt; }
    .totals-section { justify-content: stretch; }
    .totals-box { min-width: 100%; }
    .meta-row { flex-direction: column; gap: 4px; }
  }
</style>
</head>
<body>
<div class="receipt">
  ${isDraft ? '<div class="draft-watermark">DRAFT</div>' : ""}

  <div class="gold-strip-top"></div>

  <!-- ── HEADER ── -->
  <div class="header">
    <div class="header-logo">
      <img src="/icons/icon-96.png" alt="${esc(biz)} logo">
    </div>

    <div class="header-center">
      <div class="biz-name">${esc(biz)}</div>
      <div class="biz-tagline">Commission Agent</div>
      ${bizAddr ? `<div style="font-size:8.5pt;color:#555;margin-top:4px;">${esc(bizAddr)}</div>` : ""}
    </div>

    <div class="header-right">
      ${bizPhone ? `<div style="font-weight:700;">📞 ${esc(bizPhone)}</div>` : ""}
      <div style="margin-top:6px;font-size:8pt;color:#777;">Canvassing Agents</div>
    </div>
  </div>

  <!-- ── META: Bill No + Date ── -->
  <div class="meta-row">
    <div class="meta-item">
      <span class="meta-label">Bill No.</span>
      <span class="meta-value-bill">${esc(billNo)}</span>
    </div>
    <div class="meta-item">
      <span class="meta-label">Date:</span>
      <span class="meta-value-date">${esc(billDate)}</span>
    </div>
  </div>

  <!-- ── CUSTOMER ── -->
  <div class="customer-row">
    <span class="ms-label">M/s</span>
    <span class="customer-name">${esc(customer)}</span>
    ${phone ? `<span class="customer-phone">📞 ${esc(phone)}</span>` : ""}
  </div>

  <!-- ── DETAILS TABLE ── -->
  <table class="details-table">
    <thead>
      <tr>
        <th>Particular</th>
        <th>Qty (Tons)</th>
        <th>Qty (Quintals)</th>
        <th class="text-right">Rate / Quintal</th>
        <th class="text-right">Comm. / Quintal</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td style="font-weight:700;font-size:12pt;">${esc(partic)}</td>
        <td style="font-family:'Courier New',monospace;font-weight:700;font-size:12pt;">${esc(formatQuantity(qtyTons))}</td>
        <td style="font-family:'Courier New',monospace;font-weight:700;font-size:12pt;">${esc(formatQuantity(qtyQ))}</td>
        <td style="text-align:right;font-family:'Courier New',monospace;font-weight:700;">${esc(formatCurrency(rate))}</td>
        <td style="text-align:right;font-family:'Courier New',monospace;font-weight:700;color:#15803d;">${esc(formatCurrency(comm))}</td>
      </tr>
    </tbody>
  </table>

  <!-- ── TOTALS ── -->
  <div class="totals-section">
    <div class="totals-box">
      <div class="total-row total-row-main">
        <span class="total-label">Total Bill Value</span>
        <span class="total-val">${esc(formatCurrency(totalBill))}</span>
      </div>
      <div class="total-row total-row-comm">
        <span class="total-label">Commission (${esc(formatCurrency(comm))}/qtl)</span>
        <span class="total-val">${esc(formatCurrency(totalComm))}</span>
      </div>
      <div class="total-row" style="background:#fafaf8;font-size:8.5pt;">
        <span class="total-label" style="color:#999;">Quantity</span>
        <span class="total-val" style="font-size:9pt;color:#777;">${esc(formatQuantity(qtyTons))} ton = ${esc(formatQuantity(qtyQ))} qtl</span>
      </div>
    </div>
  </div>

  ${remarks ? `
  <div class="remarks-section">
    <div class="remarks-label">Remarks</div>
    <div>${esc(remarks)}</div>
  </div>` : ""}

  <!-- ── GRAIN DIVIDER ── -->
  <div class="grain-divider">〰〰 ✦ 〰〰</div>

  <!-- ── FOOTER ── -->
  <div class="footer">
    <div class="footer-bank">
      ${bankDetails ? `<div>${esc(bankDetails).replace(/\n/g, " &nbsp;|&nbsp; ")}</div>` : ""}
      <div class="footer-eo" style="margin-top:4px;">E. &amp; O.E.</div>
    </div>

    <div class="footer-sig">
      <div class="sig-line">For: ${esc(biz)}</div>
      <div style="font-size:8pt;color:#888;margin-top:2px;">Authorized Signatory</div>
    </div>
  </div>

  <div class="gold-strip-bottom"></div>
</div>
</body>
</html>
  `;
}

// ─── Live Preview (inline, not full HTML doc) ───────────────────────────────

/**
 * Render a compact inline preview for the form panel.
 * @param {object} billData
 * @param {object} settings
 * @returns {string} HTML fragment
 */
export function renderBillPreview(billData, settings = {}) {
  const biz    = settings.businessName || "Your Business";
  const qtyQ   = billData.quantityQuintals || 0;
  const qtyT   = billData.quantityTons     || 0;
  const bill   = billData.totalBill        || 0;
  const comm   = billData.totalCommission  || 0;
  const rate   = billData.ratePerQuintal   || 0;
  const cRate  = billData.commissionPerQuintal || 0;

  return `
    <div style="font-family:'Times New Roman',Times,serif;border:2px solid #8b6914;background:#fffef9;border-radius:4px;overflow:hidden;">

      <!-- Gold strip -->
      <div style="height:5px;background:linear-gradient(90deg,#8b6914,#d4af37,#f5d060,#d4af37,#8b6914);"></div>

      <!-- Mini header -->
      <div style="text-align:center;padding:10px 12px 6px;border-bottom:1.5px solid #d4af37;">
        <div style="font-size:13pt;font-weight:900;color:#7a1f1f;text-transform:uppercase;letter-spacing:1px;">${esc(biz)}</div>
        <div style="font-size:7pt;letter-spacing:3px;color:#8b6914;font-weight:600;text-transform:uppercase;">Commission Agent</div>
      </div>

      <!-- Bill no + date -->
      <div style="display:flex;justify-content:space-between;padding:6px 12px;background:linear-gradient(to right,#fffbf0,#fff9ec);border-bottom:1px solid #d4af37;font-size:9pt;">
        <span><b style="color:#555;">Bill No.</b> <b style="color:#c0392b;font-size:12pt;">${esc(billData.billNumber || "—")}</b></span>
        <span><b style="color:#555;">Date:</b> ${esc(formatDate(billData.billDate)) || "—"}</span>
      </div>

      <!-- Customer -->
      <div style="padding:6px 12px;border-bottom:1px solid #e0cc88;font-size:9.5pt;">
        <span style="color:#777;font-weight:600;">M/s</span>
        <span style="font-weight:800;color:#1a1a1a;font-size:11pt;margin-left:8px;">${esc(billData.customerName || "—")}</span>
      </div>

      <!-- Table -->
      <table style="width:100%;border-collapse:collapse;font-size:9pt;">
        <tr style="background:#1a1a1a;">
          <th style="color:#f5d060;padding:5px 8px;text-align:left;font-weight:700;font-size:7.5pt;">PARTICULAR</th>
          <th style="color:#f5d060;padding:5px 8px;text-align:right;font-weight:700;font-size:7.5pt;">QTY (T)</th>
          <th style="color:#f5d060;padding:5px 8px;text-align:right;font-weight:700;font-size:7.5pt;">RATE</th>
          <th style="color:#f5d060;padding:5px 8px;text-align:right;font-weight:700;font-size:7.5pt;">COMM.</th>
        </tr>
        <tr>
          <td style="padding:7px 8px;border-bottom:1px solid #e0cc88;font-weight:700;">${esc(billData.particular || "—")}</td>
          <td style="padding:7px 8px;border-bottom:1px solid #e0cc88;text-align:right;font-family:monospace;">${esc(formatQuantity(qtyT))}</td>
          <td style="padding:7px 8px;border-bottom:1px solid #e0cc88;text-align:right;font-family:monospace;">${esc(formatCurrency(rate))}</td>
          <td style="padding:7px 8px;border-bottom:1px solid #e0cc88;text-align:right;font-family:monospace;color:#15803d;">${esc(formatCurrency(cRate))}</td>
        </tr>
      </table>

      <!-- Totals -->
      <div style="margin:0;border-top:2px solid #8b6914;">
        <div style="display:flex;justify-content:space-between;padding:8px 12px;background:#1a1a1a;">
          <span style="color:#f5d060;font-size:9pt;font-weight:700;">Total Bill Value</span>
          <span style="color:#fff;font-weight:900;font-size:13pt;font-family:monospace;">${esc(formatCurrency(bill))}</span>
        </div>
        <div style="display:flex;justify-content:space-between;padding:6px 12px;background:#f0fff4;border-top:1px solid #86efac;">
          <span style="color:#14532d;font-size:8.5pt;font-weight:700;">Commission</span>
          <span style="color:#15803d;font-weight:900;font-size:11pt;font-family:monospace;">${esc(formatCurrency(comm))}</span>
        </div>
      </div>

      <!-- Bottom gold strip -->
      <div style="height:5px;background:linear-gradient(90deg,#8b6914,#d4af37,#f5d060,#d4af37,#8b6914);"></div>
    </div>
  `;
}

// ─── Utility ───────────────────────────────────────────────────────────────
export function escHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g,"&amp;").replace(/</g,"&lt;")
    .replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
}

function esc(s) { return escHtml(s); }
