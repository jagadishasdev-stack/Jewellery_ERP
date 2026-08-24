/**
 * printService — routes every print job in the app through QZ Tray (a small
 * free local bridge app: https://qz.io) when it's installed and running, so
 * jobs go silently to the printer assigned for that role (thermal_label,
 * thermal_receipt, or regular) with no OS print dialog and no manual picking.
 *
 * If QZ Tray isn't installed/running, every call falls back to exactly the
 * app's original behavior — window.open() + document.write() + window.print()
 * — so nothing breaks for a shop that hasn't installed QZ Tray yet.
 *
 * QZ Tray runs unsigned/self-signed here (fine for an internal LAN tool): it
 * will show a one-time "unknown website" trust prompt in the tray icon the
 * first time a browser tab prints. A paid signing certificate from qz.io
 * removes that prompt entirely for a production rollout — not needed to use
 * this today.
 */
import qz from 'qz-tray';
import api from '../api/axios';

let connectPromise = null;
let printerCache = null; // { thermal_label, thermal_receipt, regular } -> printer name

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
  if (printerCache) return printerCache;
  try {
    const res = await api.get('/printer-config', { params: branchId ? { branchId } : {} });
    const byRole = res.data?.data || {};
    printerCache = {
      thermal_label: byRole.thermal_label?.Printer_Name || null,
      thermal_receipt: byRole.thermal_receipt?.Printer_Name || null,
      regular: byRole.regular?.Printer_Name || null,
    };
  } catch {
    printerCache = { thermal_label: null, thermal_receipt: null, regular: null };
  }
  return printerCache;
};

/** Call after saving printer config so the next print picks up the new choice. */
export const invalidatePrinterCache = () => { printerCache = null; };

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

/**
 * Prints a fully-formed HTML document (the same string every print call in
 * this app already builds) to the printer assigned to `role` — silently via
 * QZ Tray if it's connected, or via the standard browser print dialog if not.
 * Synchronous up front (see initPrintService's note on popup blockers) — call
 * this directly from a click handler, don't await a prior async step first.
 *
 * @param {'thermal_label'|'thermal_receipt'|'regular'} role
 * @param {string} html - complete <html>...</html> document string
 * @param {{ branchId?: string, windowSize?: string }} [options]
 */
export const printHTML = (role, html, options = {}) => {
  if (!isConnected()) {
    fallbackPrint(html, options.windowSize);
    return;
  }
  printViaQZ(role, html, options);
};

const printViaQZ = async (role, html, options) => {
  const printers = await fetchConfiguredPrinters(options.branchId);
  const printerName = printers[role];
  if (!printerName) {
    // QZ is running but no printer has been assigned to this role yet — the
    // window wasn't pre-opened in this branch, so open fresh for the dialog.
    fallbackPrint(html, options.windowSize);
    return;
  }
  try {
    const config = qz.configs.create(printerName);
    await qz.print(config, [{ type: 'pixel', format: 'html', flavor: 'plain', data: html }]);
  } catch (err) {
    console.error('QZ print failed, falling back to browser print dialog:', err);
    fallbackPrint(html, options.windowSize);
  }
};
