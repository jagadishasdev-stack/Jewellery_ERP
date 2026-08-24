/**
 * Off-screen Code128 barcode data-URL generator — the linear/1D barcode
 * type jewellery price tags actually use for scanning at billing (unlike
 * qrCodeUtil.js's QR codes, which the existing Label Designer only
 * supported until now). Mirrors qrCodeUtil.js's pattern so labelRenderer.js
 * can pre-resolve both barcode kinds the same way before printing.
 *
 * Unlike the QR path, JsBarcode draws synchronously onto a plain canvas —
 * no React root, no animation-frame wait needed.
 */
import JsBarcode from 'jsbarcode';

export const generateBarcode128DataUrl = (value, heightPx = 60) => {
  if (!value) return '';
  const canvas = document.createElement('canvas');
  try {
    JsBarcode(canvas, String(value), {
      format: 'CODE128',
      displayValue: false, // the label already shows the value as its own text block, same as the SATO template
      height: heightPx,
      margin: 0,
    });
    return canvas.toDataURL('image/png');
  } catch {
    // JsBarcode throws on values it can't encode (e.g. empty after trim) —
    // fail quietly with a blank image rather than breaking the whole print.
    return '';
  }
};
