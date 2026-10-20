/**
 * functions/src/index.js
 * Cloud Functions entry point — exports all HTTPS callable functions.
 */

const admin = require("firebase-admin");

// Initialize Firebase Admin once
admin.initializeApp();

const billOps = require("./bill-operations.js");

// ─── Bill Operations ────────────────────────────────────────────────────────
exports.createBill    = billOps.createBill;
exports.editBill      = billOps.editBill;
exports.deleteBill    = billOps.deleteBill;

// ─── Customer Operations ────────────────────────────────────────────────────
exports.createCustomer  = billOps.createCustomer;
exports.updateCustomer  = billOps.updateCustomer;
exports.deleteCustomer  = billOps.deleteCustomer;
