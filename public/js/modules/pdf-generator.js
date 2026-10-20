/**
 * pdf-generator.js
 * 
 * On-demand PDF generation using the html2pdf.js library.
 * The library is loaded lazily — only when the owner requests a PDF.
 * PDFs are not stored automatically; generated only on demand.
 * 
 * Filename format: BILL-0001_Rahul-Traders.pdf
 */

import { renderReceipt } from "./receipt-renderer.js";
import { generateFileName } from "./formatting.js";

// Track load state to avoid double-loading
let html2pdfLoaded  = false;
let html2pdfLoading = null;

// ─── Library Loading ───────────────────────────────────────────────────────

/**
 * Lazily load html2pdf.js from CDN.
 * Only loads once; subsequent calls return immediately.
 * @returns {Promise<void>}
 */
async function loadHtml2Pdf() {
  if (html2pdfLoaded) return;
  if (html2pdfLoading) return html2pdfLoading;

  html2pdfLoading = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js";
    script.integrity = "sha512-GsLlZN/3F2ErC5ifS5QtgpiJtWd43JWSuIgh7mbzZ8zBps+dvLusV+eNQATqgA/HdeKFVgA5v3S/cIrLF7QnA==";
    script.crossOrigin = "anonymous";
    script.onload = () => {
      html2pdfLoaded = true;
      resolve();
    };
    script.onerror = () => {
      html2pdfLoading = null;
      reject(new Error("Failed to load PDF library. Please check your internet connection."));
    };
    document.head.appendChild(script);
  });

  return html2pdfLoading;
}

// ─── PDF Generation ───────────────────────────────────────────────────────

/**
 * Generate and download a PDF for a bill.
 * 
 * @param {object} bill - Complete bill data (from Firestore or draft)
 * @param {object} [options]
 * @param {boolean} [options.download=true] - Auto-download the PDF
 * @param {boolean} [options.returnBlob=false] - Return blob instead of downloading
 * @returns {Promise<Blob|null>} Blob if returnBlob=true, else null
 */
export async function generateBillPdf(bill, options = {}) {
  const { download = true, returnBlob = false } = options;

  // Load library
  try {
    await loadHtml2Pdf();
  } catch (err) {
    throw new Error("PDF library unavailable. " + err.message + "\n\nFallback: Use the Print button (Ctrl+P / Cmd+P) and select 'Save as PDF'.");
  }

  // Render receipt HTML
  const receiptHtml = renderReceipt(bill, { forPrint: true });

  // Create a temporary container
  const container = document.createElement("div");
  container.style.cssText = `
    width: 210mm;
    min-height: 297mm;
    padding: 15mm 20mm;
    background: white;
    color: black;
    font-family: Arial, sans-serif;
    font-size: 11pt;
    position: absolute;
    left: -9999px;
    top: 0;
  `;
  container.innerHTML = receiptHtml;
  document.body.appendChild(container);

  // Inject print styles for the PDF container
  injectPdfStyles(container);

  const fileName = generateFileName(
    bill.billNumber || "DRAFT",
    bill.customerNameSnapshot || "Customer"
  );

  const options_pdf = {
    margin:      [15, 20, 15, 20], // mm: top, right, bottom, left
    filename:    `${fileName}.pdf`,
    image:       { type: "jpeg", quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true, logging: false },
    jsPDF:       { unit: "mm", format: "a4", orientation: "portrait" },
    pagebreak:   { mode: "avoid-all" }
  };

  try {
    let result;
    if (returnBlob) {
      result = await window.html2pdf().set(options_pdf).from(container).outputPdf("blob");
    } else if (download) {
      await window.html2pdf().set(options_pdf).from(container).save();
      result = null;
    } else {
      result = null;
    }
    return result;
  } finally {
    document.body.removeChild(container);
  }
}

/**
 * Inject CSS styles into a PDF container element so the PDF
 * looks correct even without the main stylesheets.
 * @param {HTMLElement} container
 */
function injectPdfStyles(container) {
  const style = document.createElement("style");
  style.textContent = `
    * { box-sizing: border-box; margin: 0; padding: 0; }
    .print-header { text-align: center; border-bottom: 3px double #000; padding-bottom: 12pt; margin-bottom: 16pt; }
    .print-biz-name { font-size: 18pt; font-weight: 700; margin-bottom: 4pt; }
    .print-biz-address, .print-biz-contact { font-size: 10pt; color: #444; }
    .print-meta { display: flex; justify-content: space-between; margin-bottom: 14pt; padding-bottom: 10pt; border-bottom: 1px solid #ccc; }
    .print-meta-right { text-align: right; }
    .print-label { font-size: 8pt; text-transform: uppercase; letter-spacing: 0.06em; color: #666; font-weight: 600; display: block; margin-bottom: 2pt; }
    .print-bill-number { font-size: 16pt; font-weight: 700; font-family: 'Courier New', monospace; }
    .print-bill-date { font-size: 11pt; font-weight: 600; }
    .print-customer { margin-bottom: 14pt; padding: 8pt 10pt; border: 1px solid #ddd; border-radius: 4pt; background: #f9f9f9; }
    .print-customer-label { font-size: 8pt; text-transform: uppercase; font-weight: 600; color: #666; margin-bottom: 4pt; }
    .print-customer-name { font-size: 13pt; font-weight: 700; }
    .print-customer-phone { font-size: 10pt; color: #444; margin-top: 2pt; }
    .print-details-table { width: 100%; border-collapse: collapse; margin-bottom: 12pt; }
    .print-details-table th { background: #1a1a1a; color: white; font-size: 9pt; font-weight: 700; text-transform: uppercase; padding: 6pt 8pt; text-align: left; }
    .print-details-table td { font-size: 11pt; padding: 8pt 8pt; border-bottom: 1px solid #eee; }
    .print-details-table th:last-child, .print-details-table td:last-child { text-align: right; }
    .print-monospace { font-family: 'Courier New', monospace; }
    .print-totals { border: 2px solid #1a1a1a; border-radius: 4pt; overflow: hidden; margin-bottom: 14pt; margin-left: auto; width: 55%; }
    .print-total-row { display: flex; justify-content: space-between; padding: 7pt 10pt; border-bottom: 1px solid #ddd; }
    .print-total-row:last-child { border-bottom: none; }
    .print-total-label { font-size: 10pt; color: #444; font-weight: 600; }
    .print-total-value { font-size: 11pt; font-weight: 700; font-family: 'Courier New', monospace; }
    .print-total-grand { background: #1a1a1a; }
    .print-total-grand .print-total-label, .print-total-grand .print-total-value { color: white; font-size: 13pt; }
    .print-total-commission { background: #f0fdf4; }
    .print-remarks { margin-bottom: 12pt; padding: 6pt 10pt; border-left: 3px solid #ddd; font-size: 10pt; color: #444; }
    .print-remarks-label { font-size: 8pt; text-transform: uppercase; font-weight: 600; color: #888; margin-bottom: 2pt; }
    .print-footer { margin-top: 24pt; padding-top: 10pt; border-top: 1px solid #ccc; display: flex; justify-content: space-between; }
    .print-footer-note { font-size: 8pt; color: #888; }
    .print-signature-box { text-align: center; min-width: 120pt; }
    .print-signature-line { border-top: 1px solid #333; margin-bottom: 4pt; padding-top: 40pt; }
    .print-signature-label { font-size: 8pt; color: #666; text-transform: uppercase; }
    .print-draft-watermark { position: fixed; top: 50%; left: 50%; transform: translate(-50%,-50%) rotate(-45deg); font-size: 72pt; font-weight: 900; color: rgba(0,0,0,0.05); pointer-events: none; white-space: nowrap; }
  `;
  container.appendChild(style);
}

/**
 * Print the receipt using the browser's print dialog.
 * More reliable fallback when PDF generation fails.
 * 
 * @param {object} bill
 */
export function printReceipt(bill) {
  const receiptHtml = renderReceipt(bill, { forPrint: true });
  const printWindow = window.open("", "_blank", "width=800,height=1000");

  if (!printWindow) {
    throw new Error("Could not open print window. Please allow popups for this site.");
  }

  printWindow.document.write(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Bill ${bill.billNumber || ""} — ${bill.businessNameSnapshot || ""}</title>
      <link rel="stylesheet" href="/css/base.css">
      <link rel="stylesheet" href="/css/print.css">
      <style>
        body { font-family: Arial, sans-serif; padding: 0; margin: 0; }
        @media screen { body { padding: 20px; max-width: 800px; margin: auto; } }
        .print-draft-watermark { position: fixed; top: 50%; left: 50%; transform: translate(-50%,-50%) rotate(-45deg); font-size: 72pt; font-weight: 900; color: rgba(0,0,0,0.05); pointer-events: none; white-space: nowrap; z-index: 0; }
      </style>
    </head>
    <body id="print-receipt">
      ${receiptHtml}
      <script>
        window.onload = function() {
          window.print();
          setTimeout(() => window.close(), 2000);
        };
      </script>
    </body>
    </html>
  `);
  printWindow.document.close();
}
