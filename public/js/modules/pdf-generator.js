/**
 * pdf-generator.js
 *
 * On-demand PDF generation using html2pdf.js.
 * After download → automatically opens customer's WhatsApp chat.
 */

import { renderReceipt } from "./receipt-renderer.js";
import { generateFileName } from "./formatting.js";
import { shareViaWhatsApp } from "./whatsapp-share.js";

let html2pdfLoaded  = false;
let html2pdfLoading = null;

// ─── Lazy load html2pdf ────────────────────────────────────────────────────
async function loadHtml2Pdf() {
  if (html2pdfLoaded) return;
  if (html2pdfLoading) return html2pdfLoading;

  html2pdfLoading = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js";
    script.crossOrigin = "anonymous";
    script.onload  = () => { html2pdfLoaded = true; resolve(); };
    script.onerror = () => { html2pdfLoading = null; reject(new Error("Failed to load PDF library. Check internet connection.")); };
    document.head.appendChild(script);
  });
  return html2pdfLoading;
}

// ─── Generate & Download PDF, then open WhatsApp ──────────────────────────

/**
 * Generate a PDF for a bill, download it, then open WhatsApp chat with customer.
 *
 * @param {object} bill
 * @param {object} [options]
 * @param {boolean} [options.openWhatsApp=true] - Open WA after download
 * @param {boolean} [options.returnBlob=false]  - Return blob instead of downloading
 * @returns {Promise<Blob|null>}
 */
export async function generateBillPdf(bill, options = {}) {
  const { openWhatsApp = true, returnBlob = false } = options;

  // Load html2pdf
  try {
    await loadHtml2Pdf();
  } catch (err) {
    // Fallback to print if CDN unreachable
    throw new Error("PDF library unavailable. Use the Print button instead (Ctrl+P → Save as PDF).\n\n" + err.message);
  }

  // Build receipt HTML (full document)
  const receiptHtml = renderReceipt(bill);

  // Create an off-screen iframe for clean rendering
  const iframe = document.createElement("iframe");
  iframe.style.cssText = "position:absolute;left:-9999px;top:0;width:210mm;height:297mm;border:none;";
  document.body.appendChild(iframe);

  const iDoc = iframe.contentDocument || iframe.contentWindow.document;
  iDoc.open();
  iDoc.write(receiptHtml);
  iDoc.close();

  // Wait for iframe to render
  await new Promise(r => setTimeout(r, 300));

  const fileName = generateFileName(
    bill.billNumber || "DRAFT",
    bill.customerNameSnapshot || "Customer"
  );

  const pdfOptions = {
    margin:      5,
    filename:    `${fileName}.pdf`,
    image:       { type: "jpeg", quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true, logging: false, allowTaint: true },
    jsPDF:       { unit: "mm", format: "a4", orientation: "portrait" },
    pagebreak:   { mode: "avoid-all" }
  };

  try {
    let result = null;

    if (returnBlob) {
      result = await window.html2pdf()
        .set(pdfOptions)
        .from(iDoc.body)
        .outputPdf("blob");
    } else {
      await window.html2pdf()
        .set(pdfOptions)
        .from(iDoc.body)
        .save();
    }

    // ── After successful download → open WhatsApp ─────────────────────
    if (!returnBlob && openWhatsApp) {
      // Small delay so the download dialog appears first
      setTimeout(() => {
        shareViaWhatsApp(bill);
      }, 900);
    }

    return result;
  } finally {
    document.body.removeChild(iframe);
  }
}

// ─── Print Receipt ─────────────────────────────────────────────────────────

/**
 * Open the browser print dialog with the premium receipt layout.
 * @param {object} bill
 */
export function printReceipt(bill) {
  const receiptHtml = renderReceipt(bill);
  const pw = window.open("", "_blank", "width=820,height=1000");

  if (!pw) {
    throw new Error("Popups are blocked. Please allow popups for this site and try again.");
  }

  pw.document.write(receiptHtml);
  pw.document.close();

  // Auto-print after styles load
  pw.onload = () => {
    pw.focus();
    pw.print();
    setTimeout(() => pw.close(), 2500);
  };

  // Fallback if onload doesn't fire
  setTimeout(() => {
    try { pw.focus(); pw.print(); } catch {}
  }, 600);
}
