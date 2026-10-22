/**
 * whatsapp-share.js
 *
 * WhatsApp sharing for bills.
 * After PDF download → opens customer's WhatsApp chat directly.
 * Owner types a message and sends the PDF from their phone gallery.
 */

import { formatCurrency, formatQuantity, formatDate, formatPhoneForWhatsApp } from "./formatting.js";

// ─── Owner's WhatsApp number ───────────────────────────────────────────────
// This is the number the bill text gets sent FROM (owner's device).
// When customer phone is available → opens their chat (owner sends TO customer).
// When no customer phone → opens wa.me with just the message text.
const OWNER_WHATSAPP = ""; // optional: set owner's number if needed

// ─── Generate WhatsApp URL ─────────────────────────────────────────────────

/**
 * Build a wa.me URL that opens the customer's WhatsApp chat with bill details pre-filled.
 * @param {object} bill
 * @param {string} [overridePhone] - Override customer phone
 * @returns {{ url: string, message: string, hasPhone: boolean }}
 */
export function generateWhatsAppUrl(bill, overridePhone = null) {
  const message = generateWhatsAppMessage(bill);
  const encoded = encodeURIComponent(message);

  const rawPhone = overridePhone || bill.customerPhoneSnapshot || "";
  const waPhone  = rawPhone ? formatPhoneForWhatsApp(rawPhone) : "";
  const hasPhone = waPhone && /^\d{7,15}$/.test(waPhone);

  // Opens customer's chat if phone is known; otherwise generic share
  const url = hasPhone
    ? `https://wa.me/${waPhone}?text=${encoded}`
    : `https://wa.me/?text=${encoded}`;

  return { url, message, hasPhone: !!hasPhone };
}

/**
 * Build the WhatsApp bill message text.
 */
export function generateWhatsAppMessage(bill) {
  const biz     = bill.businessNameSnapshot    || "MK Canvassing";
  const billNo  = bill.billNumber  || "PENDING";
  const date    = formatDate(bill.billDate);
  const cust    = bill.customerNameSnapshot    || "—";
  const partic  = bill.particular              || "—";
  const qtyT    = formatQuantity(bill.quantityTons        || 0);
  const qtyQ    = formatQuantity(bill.quantityQuintals    || 0);
  const rate    = formatCurrency(bill.ratePerQuintal      || 0);
  const total   = formatCurrency(bill.totalBill           || 0);
  const cRate   = formatCurrency(bill.commissionPerQuintal || 0);
  const comm    = formatCurrency(bill.totalCommission     || 0);

  const lines = [
    `🌾 *${biz}*`,
    `━━━━━━━━━━━━━━━━━━━━`,
    `📄 *Bill No:* ${billNo}`,
    `📅 *Date:* ${date}`,
    `👤 *M/s:* ${cust}`,
    `━━━━━━━━━━━━━━━━━━━━`,
    `📦 *Particular:* ${partic}`,
    `⚖️  *Quantity:* ${qtyT} tons (${qtyQ} quintals)`,
    `💰 *Rate/Quintal:* ${rate}`,
    `━━━━━━━━━━━━━━━━━━━━`,
    `🧾 *Total Bill Value:* *${total}*`,
    `💼 *Commission (${cRate}/qtl):* *${comm}*`,
    `━━━━━━━━━━━━━━━━━━━━`,
    `_Thank you for your business!_ 🙏`,
  ];

  if (bill.remarks) {
    lines.splice(-1, 0, `📝 *Remarks:* ${bill.remarks}`, `━━━━━━━━━━━━━━━━━━━━`);
  }

  return lines.join("\n");
}

// ─── Share via WhatsApp (text only) ───────────────────────────────────────

/**
 * Open customer's WhatsApp with bill details pre-filled.
 * Owner can then type additional message and send.
 */
export function shareViaWhatsApp(bill, overridePhone = null) {
  const { url } = generateWhatsAppUrl(bill, overridePhone);
  try {
    window.open(url, "_blank", "noopener,noreferrer");
    return true;
  } catch (err) {
    console.error("[WhatsApp] Failed to open URL:", err);
    try { navigator.clipboard.writeText(generateWhatsAppMessage(bill)); } catch {}
    return false;
  }
}

// ─── Download PDF then open WhatsApp ──────────────────────────────────────

/**
 * Download the PDF and then immediately open the customer's WhatsApp chat.
 * The owner can then attach the downloaded PDF from their gallery and send.
 *
 * @param {Blob}   pdfBlob
 * @param {string} fileName
 * @param {object} bill
 */
export async function downloadPdfThenWhatsApp(pdfBlob, fileName, bill) {
  // Step 1: Download the PDF
  const objectUrl = URL.createObjectURL(
    new File([pdfBlob], `${fileName}.pdf`, { type: "application/pdf" })
  );
  const a      = document.createElement("a");
  a.href       = objectUrl;
  a.download   = `${fileName}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(objectUrl), 30000);

  // Step 2: After a short delay (let download begin), open WhatsApp chat
  await new Promise(r => setTimeout(r, 800));
  shareViaWhatsApp(bill);
}

// ─── Web Share API (native share sheet — files) ───────────────────────────

/**
 * Try native Web Share API with the PDF file.
 * Falls back to download + WhatsApp if not supported.
 *
 * @param {Blob}   pdfBlob
 * @param {string} fileName
 * @param {object} bill
 */
export async function shareOrDownloadPdf(pdfBlob, fileName, bill) {
  const file = new File([pdfBlob], `${fileName}.pdf`, { type: "application/pdf" });

  // Try native share sheet (Android Chrome supports file sharing natively)
  if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({
        files: [file],
        title: `Bill ${bill.billNumber || ""}`,
        text:  generateWhatsAppMessage(bill),
      });
      return; // User handled it via native sheet
    } catch (err) {
      if (err.name === "AbortError") return; // User cancelled
      console.warn("[Share] Web Share API failed, falling back:", err);
    }
  }

  // Fallback: download PDF, then open WhatsApp
  await downloadPdfThenWhatsApp(pdfBlob, fileName, bill);
}
