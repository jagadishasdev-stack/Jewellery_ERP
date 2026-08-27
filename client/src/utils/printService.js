/**
 * printService — routes every print job in the app through QZ Tray (a small
 * free local bridge app: https://qz.io) when it's installed and running, so
 * jobs go silently to the printer assigned for that document type (one of
 * the 9 roles in PRINTER_ROLES below) with no OS print dialog and no manual
 * picking. QZ Tray itself runs identically on macOS and Windows (it's a
 * cross-platform Java bridge, not a browser API) — nothing here is
 * OS-specific; `qz.printers.find()` just returns whatever's registered with
 * the local OS's print system on either platform.
 *
 * If QZ Tray isn't installed/running, every call falls back to exactly the
 * app's original behavior — window.open() + document.write() + window.print()
 * — so nothing breaks for a shop that hasn't installed QZ Tray yet, and that
 * fallback (the plain browser print dialog) also behaves identically on Mac
 * and Windows since it's standard browser/OS printing, not custom code.
 *
 * QZ Tray runs unsigned/self-signed here (fine for an internal LAN tool): it
 * will show a one-time "unknown website" trust prompt in the tray icon the
 * first time a browser tab prints. A paid signing certificate from qz.io
 * removes that prompt entirely for a production rollout — not needed to use
 * this today.
 */
import qz from 'qz-tray';
import { printerConfigApi, printLogApi } from '../api/modules';

// The 9 document-type roles from the Printer Setup spec (§1/§7) — must match
// server/src/routes/printerConfig.js's ROLES exactly.
export const PRINTER_ROLES = ['quotation', 'sales_bill', 'purchase_bill', 'barcode', 'receipt', 'credit_note', 'debit_note', 'reports', 'other'];

/**
 * Maps an Invoice Studio Document_Type (or any other doc-type string this
 * app uses) to the printer role that should handle it. Anything not listed
 * falls through to 'other' — a shop that hasn't configured a printer for
 * every single niche document type still gets *a* printer, not nothing.
 */
const DOC_TYPE_TO_ROLE = {
  // 'SALES' is Invoice Studio's canonical Document_Type (ALL_DOC_TYPES in
  // routes/invoiceStudio.js); 'SALES_BILL' is a separate, older doc-type
  // string the AI-analyze upload flow in InvoiceStudio.jsx still uses
  // consistently for its own save+resolve — both map here so printing
  // never falls through to 'other' just because two doc-type vocabularies
  // exist in the codebase.
  SALES: 'sales_bill', SALES_BILL: 'sales_bill', GST_INVOICE: 'sales_bill',
  PURCHASE: 'purchase_bill', OLD_GOLD_PURCHASE: 'purchase_bill',
  QUOTATION: 'quotation', ESTIMATE: 'quotation',
  SALES_RETURN: 'credit_note',
  PURCHASE_RETURN: 'debit_note',
  BARCODE_LABEL: 'barcode',
  REPAIR_RECEIPT: 'receipt', CUSTOMER_RECEIPT: 'receipt', CUSTOMER_PAYMENT: 'receipt', SCHEME_RECEIPT: 'receipt',
  SCHEME_LEDGER: 'reports',
};
export const docTypeToPrinterRole = (docType) => DOC_TYPE_TO_ROLE[docType] || 'other';

let connectPromise = null;
// Keyed by branchId (or the literal string 'null' for "no branch context") —
// was a single shared object before, which meant printing for Branch A then
// later Branch B in the same session (without a printer-config save
// happening in between, which is the only thing that used to invalidate it)
// would silently keep reusing Branch A's printer names. Found via audit.
const printerCacheByBranch = new Map();
// Last known outcome per OS printer name — 'connected' after a successful
// print/test, 'error' after a failed one, absent if never tried. Not a live
// poll (QZ's printers.getStatus/callback API isn't used here — that's a
// meaningfully bigger subscription-management piece) but enough to satisfy
// "don't assume a printer works just because it was configured once."
const printerStatus = new Map();
export const getPrinterStatus = (printerName) => printerStatus.get(printerName) || 'unknown';

// QZ Tray requires a certificate/signature promise pair even in unsigned mode.
qz.security.setCertificatePromise((resolve) => resolve());
qz.security.setSignaturePromise(() => (resolve) => resolve());

const isConnected = () => {
  try { return qz.websocket.isActive(); } catch { return false; }
};

/**
 * Synchronous QZ Tray connection check — safe to call directly inside a
 * click handler (see isQZConnected's usage notes on popup blockers below).
 */
export const isQZConnected = () => isConnected();

/**
 * Connects to the local QZ Tray bridge. Safe to call repeatedly — resolves
 * false (never throws) if QZ Tray isn't installed/running, so callers can
 * treat "not connected" as a normal, expected outcome rather than an error.
 */
export const connectQZ = async () => {
  if (isConnected()) return true;
  if (connectPromise) return connectPromise;
  connectPromise = qz.websocket.connect({ retries: 1, delay: 0 })
    .then(() => true)
    .catch(() => false)
    .finally(() => { connectPromise = null; });
  return connectPromise;
};

/** Lists every OS printer QZ Tray can see. Empty array if QZ isn't connected. */
export const listPrinters = async () => {
  const connected = await connectQZ();
  if (!connected) return [];
  try { return await qz.printers.find(); } catch { return []; }
};

const fetchConfiguredPrinters = async (branchId) => {
  const cacheKey = branchId || 'null';
  if (printerCacheByBranch.has(cacheKey)) return printerCacheByBranch.get(cacheKey);
  let byRoleNames;
  try {
    const res = await printerConfigApi.get(branchId ? { branchId } : {});
    const byRole = res.data?.data || {};
    byRoleNames = Object.fromEntries(PRINTER_ROLES.map((r) => [r, byRole[r]?.Printer_Name || null]));
  } catch {
    byRoleNames = Object.fromEntries(PRINTER_ROLES.map((r) => [r, null]));
  }
  printerCacheByBranch.set(cacheKey, byRoleNames);
  return byRoleNames;
};

/** Call after saving printer config so the next print picks up the new choice. */
export const invalidatePrinterCache = () => { printerCacheByBranch.clear(); };

/**
 * Opens a blank print window right now, synchronously. Use this from a click
 * handler BEFORE doing any async prep work (fetching a template, generating
 * a QR code, etc.) whenever `isQZConnected()` is false — popup blockers
 * require window.open() to happen in the same tick as the user gesture, so
 * it can't wait for that async work to finish first. Fill it in afterward
 * with writeAndPrint(). If `isQZConnected()` is true, skip this entirely and
 * call printHTML() once the HTML is ready — no popup is ever needed.
 */
export const openPrintWindow = (windowSize) => window.open('', '_blank', windowSize || 'width=400,height=600');

/** Writes the finished HTML into a window opened by openPrintWindow() and prints it. */
export const writeAndPrint = (printWindow, html) => {
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => { printWindow.print(); printWindow.close(); }, 300);
};

const fallbackPrint = (html, windowSize) => writeAndPrint(openPrintWindow(windowSize), html);

/**
 * Call once at app startup (see App.jsx) to connect to QZ Tray in the
 * background, ahead of any actual print action. This matters for popup
 * blockers: printHTML() below must call window.open() SYNCHRONOUSLY, in the
 * same tick as the user's click, whenever it decides to fall back to the
 * browser print dialog — it can't `await` a connection attempt first without
 * losing the "trusted user gesture" that lets window.open bypass the popup
 * blocker. Pre-warming here means printHTML() can make that decision with a
 * plain synchronous isActive() check instead of an await.
 */
export const initPrintService = () => { connectQZ(); };

// Best-effort — a flaky log write must never be treated as the print itself
// having failed, so this never throws into the caller.
const logPrintAttempt = ({ role, docType, docNumber, printerName, status, error, branchId }) => {
  printLogApi.record({
    printerRole: role, documentType: docType || null, documentNumber: docNumber || null,
    printerName, status, errorMessage: error, branchId,
  }).catch(() => {});
};

/**
 * Prints a fully-formed HTML document (the same string every print call in
 * this app already builds) to the printer assigned to `role` — silently via
 * QZ Tray if it's connected, or via the standard browser print dialog if not.
 * Synchronous up front (see initPrintService's note on popup blockers) — call
 * this directly from a click handler, don't await a prior async step first.
 *
 * Returns a Promise the caller MAY await to react to failure (spec §26 —
 * "invoice saved, but printing failed" should be a distinct, visible
 * message, not silence) — but doesn't have to; a fire-and-forget call
 * behaves exactly as before.
 *
 * @param {typeof PRINTER_ROLES[number]} role
 * @param {string} html - complete <html>...</html> document string
 * @param {{ branchId?: string, windowSize?: string, docType?: string, docNumber?: string, printerNameOverride?: string }} [options]
 *   printerNameOverride (§16 manual/temporary override) — send THIS print
 *   job to a specific OS printer without touching the saved default.
 * @returns {Promise<{ success: boolean, usedFallback: boolean, printerName?: string, error?: string }>}
 */
export const printHTML = (role, html, options = {}) => {
  if (options.printerNameOverride) {
    if (!isConnected()) {
      fallbackPrint(html, options.windowSize);
      return Promise.resolve({ success: false, usedFallback: true, error: 'QZ Tray is not connected — cannot reach a specific printer.' });
    }
    return printToNamedPrinter(options.printerNameOverride, html, options, { role, docType: options.docType, docNumber: options.docNumber });
  }
  if (!isConnected()) {
    fallbackPrint(html, options.windowSize);
    return Promise.resolve({ success: true, usedFallback: true });
  }
  return printViaQZ(role, html, options);
};

const printViaQZ = async (role, html, options) => {
  const printers = await fetchConfiguredPrinters(options.branchId);
  const printerName = printers[role];
  if (!printerName) {
    // QZ is running but no printer has been assigned to this role yet — the
    // window wasn't pre-opened in this branch, so open fresh for the dialog.
    fallbackPrint(html, options.windowSize);
    return { success: true, usedFallback: true };
  }
  return printToNamedPrinter(printerName, html, options, { role, docType: options.docType, docNumber: options.docNumber });
};

const printToNamedPrinter = async (printerName, html, options, logMeta) => {
  try {
    const config = qz.configs.create(printerName);
    await qz.print(config, [{ type: 'pixel', format: 'html', flavor: 'plain', data: html }]);
    printerStatus.set(printerName, 'connected');
    logPrintAttempt({ ...logMeta, printerName, status: 'Success', branchId: options.branchId });
    return { success: true, usedFallback: false, printerName };
  } catch (err) {
    console.error('QZ print failed, falling back to browser print dialog:', err);
    printerStatus.set(printerName, 'error');
    logPrintAttempt({ ...logMeta, printerName, status: 'Failed', error: err?.message || String(err), branchId: options.branchId });
    fallbackPrint(html, options.windowSize);
    return { success: false, usedFallback: true, printerName, error: err?.message || String(err) };
  }
};

/**
 * Test Print (spec §13) — sends a small, throwaway test document directly to
 * `printerName` (bypassing role/config resolution — this tests one specific
 * OS printer, whatever role it's assigned to, or none yet), and reports back
 * exactly what the spec asks for: a clear success/failure outcome, not a
 * silent fallback. Also updates getPrinterStatus() and writes a Print
 * History row (Document_Type 'Test Print', no document number) so a test
 * print is auditable the same way a real one is.
 *
 * @returns {Promise<{ success: boolean, error?: string }>}
 */
export const testPrint = async (printerName, role = 'other') => {
  const connected = await connectQZ();
  if (!connected) return { success: false, error: 'QZ Tray is not connected — install/start it, then try again.' };
  const testHtml = `<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body style="font-family:sans-serif;padding:20px;">
    <h3>Jewellery ERP — Test Print</h3>
    <p>Printer: ${printerName}</p>
    <p>${new Date().toLocaleString()}</p>
    <p>If you can read this, the printer is connected and working.</p>
  </body></html>`;
  try {
    const config = qz.configs.create(printerName);
    await qz.print(config, [{ type: 'pixel', format: 'html', flavor: 'plain', data: testHtml }]);
    printerStatus.set(printerName, 'connected');
    logPrintAttempt({ role, docType: 'Test Print', printerName, status: 'Success' });
    return { success: true };
  } catch (err) {
    printerStatus.set(printerName, 'error');
    const message = err?.message || String(err);
    logPrintAttempt({ role, docType: 'Test Print', printerName, status: 'Failed', error: message });
    return { success: false, error: message };
  }
};
