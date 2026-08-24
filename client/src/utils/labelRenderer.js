/**
 * labelRenderer.js — shared rendering engine for jewellery barcode/RFID
 * stock tags designed in client/src/pages/admin/LabelDesignerPage.jsx.
 *
 * ── WHY THIS FILE EXISTS ─────────────────────────────────────────────────
 * Invoice Studio (pages/invoice/InvoiceStudio.jsx) has two separate code
 * paths for "what a block looks like": its in-canvas Print button (prints
 * generic bordered boxes labelled with the block's `type` string) and its
 * <LivePreview> component (renders real per-field sample data, but never
 * feeds print). They drift apart. For labels we do the opposite: there is
 * exactly ONE function, `renderLabelHTML()`, that turns a block layout +
 * a data object into markup. It is used for:
 *   1. The Label Designer's on-canvas "live preview" panel (sample data), and
 *   2. The real print output for an actual ornament — see `printLabel()`
 *      below, which other code (ornament/stock pages) can import later to
 *      print a real tag. Do NOT build a second renderer for that — call
 *      `renderLabelHTML()` (or `printLabel()`, which wraps it) instead.
 *
 * ── COORDINATE SYSTEM ────────────────────────────────────────────────────
 * Blocks are stored as { id, type, x, y, w, h, content }, same shape as
 * InvoiceStudio's blocks. x/y/w/h are in "block units" where
 * BLOCK_UNITS_PER_MM units = 1mm (see mmToPx/pxToMm below) — this keeps the
 * designer's mouse-drag math simple (plain integers, same pattern as
 * InvoiceStudio's CanvasBlock) while remaining trivially convertible to the
 * real mm dimensions used for @page print CSS and for the Canvas_Width_MM/
 * Canvas_Height_MM values persisted with the template.
 */
import { generateQrDataUrl } from './qrCodeUtil';
import { generateBarcode128DataUrl } from './barcodeCodeUtil';

// 1 mm == this many block units. Purely an internal editing resolution
// (0.1mm precision); unrelated to on-screen CSS pixels.
export const BLOCK_UNITS_PER_MM = 10;
export const mmToPx = (mm) => mm * BLOCK_UNITS_PER_MM;
export const pxToMm = (px) => px / BLOCK_UNITS_PER_MM;

// Fixed CSS unit conversion (96 CSS px == 1in == 25.4mm, per the CSS spec —
// true in every browser regardless of actual screen DPI). Used only to work
// out how many *screen* pixels an mm-sized element will occupy, so the
// Designer can size its scale-to-fit wrapper correctly.
export const CSS_PX_PER_MM = 96 / 25.4;

// ── Tag size presets ─────────────────────────────────────────────────────
export const LABEL_SIZE_PRESETS = [
  { key: 'SMALL', label: '1.2 inch (Small Tag)', widthMm: 30, heightMm: 20 },
  { key: 'LONG', label: '3.5 inch (Long Tag)', widthMm: 89, heightMm: 25 },
  // Matches the SATO thermal tag layout this preset was modeled on —
  // 92×15mm is the physical label size, not an arbitrary choice.
  { key: 'SATO_92x15', label: 'SATO Barcode Tag (92×15mm)', widthMm: 92, heightMm: 15 },
  { key: 'CUSTOM', label: 'Custom', widthMm: 40, heightMm: 25 },
];

// ── Component palette — scoped to jewellery price/barcode tags only ─────
// qr_code and barcode_128 are two distinct block types, not one "pick a
// symbology" block — a saved label keeps whichever one was actually placed
// on it. barcode_128 (linear Code128) is what most jewellery POS barcode
// scanners and printers like the SATO tag this was modeled on actually use;
// qr_code stays for shops that scan with a phone/2D imager instead.
export const LABEL_COMPONENTS = [
  { type: 'shop_name', label: '🏪 Shop Name' },
  { type: 'logo', label: '🖼️ Logo Image' },
  { type: 'qr_code', label: '🔲 QR Code' },
  { type: 'barcode_128', label: '▮▮▮ Barcode (Code128)' },
  { type: 'tag_no', label: '🔖 Tag Number' },
  { type: 'item_type', label: '💍 Item Type' },
  { type: 'article_no', label: '# Article Code' },
  { type: 'design_code', label: '🎨 Design Code' },
  { type: 'purity', label: '✨ Purity' },
  { type: 'gross_wt', label: '⚖️ Gross Weight' },
  { type: 'net_wt', label: '⚖️ Net Weight' },
  { type: 'wastage', label: '📉 Wastage %' },
  { type: 'making_charge', label: '🔨 Making Charge' },
  { type: 'quantity', label: '🔢 Quantity' },
  { type: 'stone_count', label: '💎 Stone/Bead Count' },
  { type: 'stone_value', label: '💎 Stone/Bead Value (est.)' },
  { type: 'floor_location', label: '📍 Floor/Location' },
  { type: 'supplier_code', label: '🏷️ Supplier/Karigar Code' },
  { type: 'huid', label: '🔐 HUID' },
  { type: 'price', label: '💰 Price' },
  { type: 'text', label: '📄 Free Text' },
];
export const LABEL_TYPE_LABEL = Object.fromEntries(LABEL_COMPONENTS.map(c => [c.type, c.label]));

export function defaultLabelContent(type) {
  const map = {
    // Single-line by design — the renderer forces no-wrap/ellipsis for this
    // type so a long shop name never wraps and breaks the tag layout.
    shop_name: { text: '{{shop_name}}', fontSize: 8, bold: true, align: 'center' },
    logo: { url: '' },
    qr_code: {},
    barcode_128: {},
    tag_no: { fontSize: 7, bold: true, align: 'left', prefix: 'Tag No: ' },
    item_type: { fontSize: 7, bold: false, align: 'left', prefix: '' },
    article_no: { fontSize: 7, bold: true, align: 'left', prefix: '' },
    design_code: { fontSize: 7, bold: false, align: 'left', prefix: '' },
    purity: { fontSize: 7, bold: true, align: 'center', badge: true },
    gross_wt: { fontSize: 7, bold: false, align: 'left', prefix: 'G: ', suffix: 'g' },
    net_wt: { fontSize: 7, bold: false, align: 'left', prefix: 'N: ', suffix: 'g' },
    wastage: { fontSize: 7, bold: false, align: 'left', prefix: 'W: ', suffix: '%' },
    making_charge: { fontSize: 7, bold: false, align: 'left', prefix: 'MC: ', suffix: '' },
    quantity: { fontSize: 7, bold: false, align: 'left', prefix: 'Q: ', suffix: '' },
    stone_count: { fontSize: 7, bold: false, align: 'left', prefix: '', suffix: '' },
    // "(est.)" left in the printed prefix on purpose — this number is
    // computed (carat × gemstone rate), not a figure anyone actually
    // entered, and the tag shouldn't imply otherwise.
    stone_value: { fontSize: 7, bold: false, align: 'left', prefix: '₹', suffix: ' (est.)' },
    floor_location: { fontSize: 7, bold: false, align: 'left', prefix: '' },
    supplier_code: { fontSize: 7, bold: false, align: 'left', prefix: '' },
    huid: { fontSize: 6, bold: false, align: 'left', prefix: 'HUID: ' },
    price: { fontSize: 9, bold: true, align: 'right', prefix: '₹', suffix: '', color: '#B8860B' },
    text: { text: 'Text', fontSize: 7, bold: false, align: 'left', color: '#000000' },
  };
  return map[type] || { text: type };
}

// ── Sample ornament used by the live preview (pixel-identical to print) ──
export const SAMPLE_ORNAMENT = {
  Article_Number: 'GLD-SAMPLE-001',
  Type_Name: 'Gold Ring',
  Design_Code: 'D3044',
  Purity_Code: '22K',
  Gross_Weight: 5.850,
  Net_Gold_Weight: 5.600,
  Wastage_Percentage: 3,
  Final_Making_Charge_Total: 850,
  Stock_Quantity: 1,
  Number_Of_Stones: 12,
  Stone_Value_Estimate: 1200,
  Floor_Name: 'Ground Floor',
  Floor_Code: 'GF',
  Supplier_Code: 'SUP1',
  HUID_Number: 'AB12CD',
  Total_Price: 34500,
  Shop_Name: 'Sample Jewellery',
};

/**
 * A reasonable starter layout for a brand-new label at the given size —
 * shop name always starts as a single-line header spanning the full width
 * at the top, per this codebase's convention.
 */
export function buildDefaultLabelBlocks(widthMm, heightMm) {
  const shopNameH = Math.max(2.5, Math.min(5, heightMm * 0.16));
  const contentY = 1 + shopNameH + 0.5;
  const contentH = Math.max(4, heightMm - contentY - 1);
  const qrSize = Math.max(8, Math.min(widthMm * 0.42, contentH));
  const rightX = qrSize + 3;
  const rightW = Math.max(10, widthMm - rightX - 1);
  const rowH = Math.max(3, contentH / 4);
  let uid = 0;
  const mk = (type, x, y, w, h) => ({
    id: `${type}_${Date.now()}_${uid++}`,
    type, x: mmToPx(x), y: mmToPx(y), w: mmToPx(w), h: mmToPx(h),
    content: defaultLabelContent(type),
  });
  return [
    mk('shop_name', 1, 1, widthMm - 2, shopNameH),
    mk('qr_code', 1, contentY + (contentH - qrSize) / 2, qrSize, qrSize),
    mk('item_type', rightX, contentY, rightW, rowH),
    mk('purity', rightX, contentY + rowH, rightW * 0.45, rowH),
    mk('gross_wt', rightX + rightW * 0.5, contentY + rowH, rightW * 0.5, rowH),
    mk('net_wt', rightX, contentY + rowH * 2, rightW, rowH),
    mk('price', rightX, contentY + rowH * 3, rightW, rowH),
  ];
}

const escapeHtml = (str) => String(str ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

const justifyFor = (align) => (align === 'center' ? 'center' : align === 'right' ? 'flex-end' : 'flex-start');

function fieldText(type, data, c) {
  switch (type) {
    case 'item_type': return `${c.prefix || ''}${data.Type_Name || ''}`;
    case 'article_no': return `${c.prefix || ''}${data.Article_Number || ''}`;
    // Tag Number reuses Article_Number — this codebase has no separate
    // physical-tag-number field, but tags often print it under a "Tag No."
    // label rather than "Article Code", hence its own component/prefix.
    case 'tag_no': return `${c.prefix || ''}${data.Tag_Number || data.Article_Number || ''}`;
    case 'design_code': return `${c.prefix || ''}${data.Design_Code || data.Design_Name || '-'}`;
    case 'purity': return data.Purity_Code || '-';
    case 'gross_wt': return `${c.prefix || ''}${parseFloat(data.Gross_Weight || 0).toFixed(3)}${c.suffix || ''}`;
    case 'net_wt': return `${c.prefix || ''}${parseFloat(data.Net_Gold_Weight ?? data.Gross_Weight ?? 0).toFixed(3)}${c.suffix || ''}`;
    case 'wastage': return `${c.prefix || ''}${parseFloat(data.Wastage_Percentage || 0).toFixed(1)}${c.suffix || ''}`;
    case 'making_charge': return `${c.prefix || ''}${parseFloat(data.Final_Making_Charge_Total || 0).toLocaleString('en-IN')}${c.suffix || ''}`;
    case 'quantity': return `${c.prefix || ''}${data.Stock_Quantity ?? 1}${c.suffix || ''}`;
    case 'stone_count': return `${c.prefix || ''}${data.Number_Of_Stones ?? 0}${c.suffix || ''}`;
    // Computed estimate (carat × gemstone rate) — see ornaments.js route
    // comment. Blank rather than "₹0" when there's genuinely nothing to
    // estimate from, so an empty tag field doesn't look like a real zero.
    case 'stone_value': {
      const v = parseFloat(data.Stone_Value_Estimate || 0);
      return v > 0 ? `${c.prefix || ''}${v.toLocaleString('en-IN')}${c.suffix || ''}` : '';
    }
    case 'floor_location': return `${c.prefix || ''}${data.Floor_Code || data.Floor_Name || '-'}`;
    case 'supplier_code': return `${c.prefix || ''}${data.Supplier_Code || '-'}`;
    case 'huid': return `${c.prefix || ''}${data.HUID_Number || '-'}`;
    case 'price': return `${c.prefix || ''}${parseFloat(data.Total_Price || 0).toLocaleString('en-IN')}${c.suffix || ''}`;
    case 'text': return c.text || '';
    default: return '';
  }
}

/**
 * THE single shared renderer. Returns an HTML string for the label surface,
 * sized in real mm (so it can be dropped into a print document unscaled,
 * or wrapped + CSS-transform-scaled for an on-screen preview — same markup
 * either way).
 *
 * @param {Array}  blocks          [{id,type,x,y,w,h,content}] — x/y/w/h in block units (see BLOCK_UNITS_PER_MM)
 * @param {number} canvasWidthMm
 * @param {number} canvasHeightMm
 * @param {object} data            ornament-shaped data (SAMPLE_ORNAMENT for preview; real ornament row for print)
 * @param {object} [qrDataUrls]    map of block.id -> QR PNG data URL, pre-resolved via resolveQrDataUrls() (QR
 *                                 generation is async, this function stays sync/pure so it's cheap to call on every
 *                                 render for the live preview)
 * @returns {string} HTML for a `width:${canvasWidthMm}mm; height:${canvasHeightMm}mm` label surface
 */
export function renderLabelHTML(blocks, canvasWidthMm, canvasHeightMm, data = SAMPLE_ORNAMENT, qrDataUrls = {}) {
  const shopName = data.Shop_Name || data.shop_name || 'Shop Name';

  const blockHtml = (blocks || []).map((b) => {
    const x = pxToMm(b.x), y = pxToMm(b.y), w = pxToMm(b.w), h = pxToMm(b.h);
    const pos = `position:absolute; left:${x}mm; top:${y}mm; width:${w}mm; height:${h}mm; box-sizing:border-box; overflow:hidden;`;
    const c = b.content || {};

    if (b.type === 'qr_code' || b.type === 'barcode_128') {
      const src = qrDataUrls[b.id] || '';
      const placeholderLabel = b.type === 'barcode_128' ? '▮▮▮' : 'QR';
      // object-fit:fill (not contain) for the linear barcode — a Code128
      // image has built-in whitespace margins already baked in by
      // JsBarcode, and "contain" would letterbox it uselessly small inside
      // an already-short label row. QR keeps "contain" since it must stay
      // square regardless of the block's aspect ratio.
      const fit = b.type === 'barcode_128' ? 'fill' : 'contain';
      const inner = src
        ? `<img src="${src}" style="width:100%; height:100%; object-fit:${fit};" />`
        : `<div style="width:100%; height:100%; border:0.2mm solid #ccc; display:flex; align-items:center; justify-content:center; font-size:6pt; color:#999; font-family:Arial,sans-serif;">${placeholderLabel}</div>`;
      return `<div style="${pos} display:flex; align-items:center; justify-content:center;">${inner}</div>`;
    }

    if (b.type === 'logo') {
      const inner = c.url
        ? `<img src="${c.url}" style="max-width:100%; max-height:100%; object-fit:contain;" />`
        : `<div style="width:100%; height:100%; border:0.2mm dashed #ccc; display:flex; align-items:center; justify-content:center; font-size:6pt; color:#999; font-family:Arial,sans-serif;">LOGO</div>`;
      return `<div style="${pos} display:flex; align-items:center; justify-content:center;">${inner}</div>`;
    }

    const text = b.type === 'shop_name'
      ? (c.text || '{{shop_name}}').replace('{{shop_name}}', shopName)
      : fieldText(b.type, data, c);

    const textSpan = `<span style="font-weight:${c.bold ? 700 : 400};">${escapeHtml(text)}</span>`;
    const rendered = (b.type === 'purity' && c.badge)
      ? `<span style="background:#B8860B; color:#fff; padding:0.4mm 1.5mm; border-radius:1mm; font-weight:${c.bold ? 700 : 400};">${escapeHtml(text)}</span>`
      : textSpan;

    // Shop name is always a single line — long names get truncated with an
    // ellipsis rather than wrapping and breaking the rest of the layout.
    const noWrap = b.type === 'shop_name' ? 'white-space:nowrap; text-overflow:ellipsis;' : '';

    return `<div style="${pos} display:flex; align-items:center; justify-content:${justifyFor(c.align)}; text-align:${c.align || 'left'}; font-size:${c.fontSize || 7}pt; font-family:Arial, sans-serif; color:${c.color || '#000'}; ${noWrap}">${rendered}</div>`;
  }).join('');

  return `<div style="position:relative; width:${canvasWidthMm}mm; height:${canvasHeightMm}mm; background:#fff; overflow:hidden;">${blockHtml}</div>`;
}

/**
 * Resolves image data-URLs for every qr_code AND barcode_128 block on the
 * label (async — QR rendering goes through an off-screen React canvas, see
 * utils/qrCodeUtil.js; Code128 through utils/barcodeCodeUtil.js). Despite
 * the name (kept for the 3 existing call sites — labelRenderer's own
 * printLabel(), thermalReceipt.js, LabelDesignerPage.jsx — that already
 * pass its result straight into renderLabelHTML()'s qrDataUrls param),
 * this now covers both image-type blocks, keyed by block.id either way.
 */
export async function resolveQrDataUrls(blocks, data = SAMPLE_ORNAMENT) {
  const imageBlocks = (blocks || []).filter((b) => b.type === 'qr_code' || b.type === 'barcode_128');
  const entries = await Promise.all(
    imageBlocks.map(async (b) => [
      b.id,
      b.type === 'barcode_128'
        ? generateBarcode128DataUrl(data.Article_Number || '')
        : await generateQrDataUrl(data.Article_Number || '', 300),
    ])
  );
  return Object.fromEntries(entries);
}

/**
 * Wraps renderLabelHTML()'s output in a standalone print document, using
 * this codebase's existing @page-sizing convention (see utils/thermalReceipt.js).
 */
export function buildLabelPrintDocument(blocks, canvasWidthMm, canvasHeightMm, data, qrDataUrls) {
  const body = renderLabelHTML(blocks, canvasWidthMm, canvasHeightMm, data, qrDataUrls);
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8" />
<title>Label</title>
<style>
  @page { size: ${canvasWidthMm}mm ${canvasHeightMm}mm; margin: 0; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { width: ${canvasWidthMm}mm; height: ${canvasHeightMm}mm; }
</style>
</head>
<body>${body}</body>
</html>`;
}

/**
 * Opens a print window and prints one label. Import this from ornament/
 * stock pages to print a real tag — pass the real ornament row as `data`
 * (same field names as SAMPLE_ORNAMENT: Article_Number, Type_Name,
 * Purity_Code, Gross_Weight, Net_Gold_Weight, Total_Price, Shop_Name).
 */
export async function printLabel(blocks, canvasWidthMm, canvasHeightMm, data) {
  // Open synchronously (same tick as the click) so popup blockers don't
  // treat the later async write as an untrusted, non-gesture action —
  // mirrors utils/thermalReceipt.js's printBarcodeLabel().
  const printWindow = window.open('', '_blank', 'width=400,height=300');
  const qrDataUrls = await resolveQrDataUrls(blocks, data);
  const html = buildLabelPrintDocument(blocks, canvasWidthMm, canvasHeightMm, data, qrDataUrls);
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => { printWindow.print(); printWindow.close(); }, 400);
}
