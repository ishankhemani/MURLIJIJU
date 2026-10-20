/**
 * whatsapp-share.js
 * 
 * Generates WhatsApp sharing links for bill details.
 * 
 * IMPORTANT LIMITATIONS:
 * - Opening WhatsApp does NOT confirm a message was sent.
 * - Click-to-chat cannot automatically attach a PDF.
 * - This only pre-fills the message text; the user must send it manually.
 */

import { formatCurrency, formatQuantity, formatDate, formatPhoneForWhatsApp } from "./formatting.js";

/**
 * Generate a WhatsApp share URL for a bill.
 * 
 * @param {object} bill - Complete bill data
 * @param {string} [recipientPhone] - Optional recipient phone (overrides bill's phone)
 * @returns {{ url: string, message: string }}
 */
export function generateWhatsAppUrl(bill, recipientPhone = null) {
  const message = generateWhatsAppMessage(bill);
  const encodedMessage = encodeURIComponent(message);

  const phone = recipientPhone || bill.customerPhoneSnapshot;
  const waPhone = phone ? formatPhoneForWhatsApp(phone) : "";

  let url;
  if (waPhone && /^\d{7,15}$/.test(waPhone)) {
    url = `https://wa.me/${waPhone}?text=${encodedMessage}`;
  } else {
    // No valid phone — open WhatsApp with message but no recipient
    url = `https://wa.me/?text=${encodedMessage}`;
  }

  return { url, message };
}

/**
 * Generate the formatted WhatsApp message text.
 * 
 * @param {object} bill
 * @returns {string}
 */
export function generateWhatsAppMessage(bill) {
  const bizName   = bill.businessNameSnapshot    || "Commission Agent";
  const billNo    = bill.billNumber  || "PENDING";
  const date      = formatDate(bill.billDate);
  const customer  = bill.customerNameSnapshot    || "—";
  const particular = bill.particular             || "—";
  const qtyTons   = formatQuantity(bill.quantityTons || 0);
  const qtyQ      = formatQuantity(bill.quantityQuintals || 0);
  const rate      = formatCurrency(bill.ratePerQuintal || 0);
  const totalBill = formatCurrency(bill.totalBill || 0);
  const commRate  = formatCurrency(bill.commissionPerQuintal || 0);
  const totalComm = formatCurrency(bill.totalCommission || 0);

  const lines = [
    `🏢 *${bizName}*`,
    `━━━━━━━━━━━━━━━━━━━━`,
    `📄 *Bill No:* ${billNo}`,
    `📅 *Date:* ${date}`,
    `👤 *Customer:* ${customer}`,
    `━━━━━━━━━━━━━━━━━━━━`,
    `📦 *Particular:* ${particular}`,
    `⚖️ *Quantity:* ${qtyTons} tons (${qtyQ} quintals)`,
    `💰 *Rate / Quintal:* ${rate}`,
    `━━━━━━━━━━━━━━━━━━━━`,
    `🧾 *Total Bill:* *${totalBill}*`,
    `💼 *Commission (${commRate}/qtl):* *${totalComm}*`,
    `━━━━━━━━━━━━━━━━━━━━`,
  ];

  if (bill.remarks) {
    lines.push(`📝 *Remarks:* ${bill.remarks}`);
    lines.push(`━━━━━━━━━━━━━━━━━━━━`);
  }

  lines.push(`_Thank you for your business!_`);

  return lines.join("\n");
}

/**
 * Open WhatsApp with the bill details.
 * Shows a warning that this is not a confirmed send.
 * 
 * @param {object} bill
 * @param {string} [recipientPhone]
 * @returns {boolean} true if URL was opened
 */
export function shareViaWhatsApp(bill, recipientPhone = null) {
  const { url } = generateWhatsAppUrl(bill, recipientPhone);

  try {
    // Open in new tab/window
    window.open(url, "_blank", "noopener,noreferrer");
    return true;
  } catch (err) {
    console.error("[WhatsApp] Failed to open URL:", err);
    // Fallback: copy to clipboard
    try {
      const { message } = generateWhatsAppUrl(bill, recipientPhone);
      navigator.clipboard.writeText(message);
    } catch {}
    return false;
  }
}

/**
 * Share a PDF file via Web Share API, falling back to download.
 * 
 * @param {Blob} pdfBlob - The PDF file as a Blob
 * @param {string} fileName - File name for the PDF
 * @param {object} bill - Bill data for the share message
 * @returns {Promise<void>}
 */
export async function shareOrDownloadPdf(pdfBlob, fileName, bill) {
  const file = new File([pdfBlob], `${fileName}.pdf`, { type: "application/pdf" });

  if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({
        files: [file],
        title: `Bill ${bill.billNumber || ""}`,
        text: `Bill for ${bill.customerNameSnapshot || "customer"}`
      });
      return;
    } catch (err) {
      if (err.name !== "AbortError") {
        console.warn("[Share] Web Share API failed, falling back to download:", err);
      } else {
        return; // User cancelled
      }
    }
  }

  // Fallback: trigger download
  const url = URL.createObjectURL(file);
  const a   = document.createElement("a");
  a.href      = url;
  a.download  = `${fileName}.pdf`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
