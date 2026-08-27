/**
 * invoiceRenderer.js — shared rendering engine for Invoice Studio templates
 * (client/src/pages/invoice/InvoiceStudio.jsx), the invoice-sized counterpart
 * to utils/labelRenderer.js's renderLabelHTML() for barcode labels.
 *
 * ── WHY THIS FILE EXISTS ─────────────────────────────────────────────────
 * Invoice Studio's own canvas "Live Preview" mostly ignores each block's
 * saved `content` and shows hardcoded sample data instead — it was never
 * wired to real sale data, and nothing in the print pipeline (POS checkout,
 * Billing Hub estimates/orders) ever read a Studio template at all. This is
 * the ONE real renderer: block layout (positions from Invoice Studio) +
 * real data (a live sale, an estimate form, an order form) -> an HTML
 * string, printed via utils/printService.js exactly like every other print
 * job in this app (silent via QZ Tray if configured, else the print dialog).
 *
 * ── DATA CONTRACT ────────────────────────────────────────────────────────
 * `data` is a flat object whose keys match Invoice Studio's own merge-field
 * names one-for-one (see ERP_VARIABLES in InvoiceStudio.jsx) — e.g.
 * `data.shop_name` resolves `{{shop_name}}`, `data.invoice_no` resolves
 * `{{invoice_no}}`. `data.items` is the one exception: an array for the
 * items_table block (each with item_name/purity/gross_weight/net_weight/
 * rate/making_charge/gst_amount/huid/amount), since a merge field can't
 * represent a repeating table row. Callers (thermalReceipt.js, BillingHub)
 * build this object from whatever real sale/estimate/order data they have —
 * any field not applicable to that document type is simply left undefined
 * and resolves to a blank, never a literal "{{...}}".
 */
import { generateQrDataUrl } from './qrCodeUtil';

export const PAPER_SIZES = {
  A4:         { w: 794,  h: 1123 },
  A4_L:       { w: 1123, h: 794  },
  A5:         { w: 559,  h: 794  },
  THERMAL_80: { w: 302,  h: 850  },
  THERMAL_58: { w: 219,  h: 850  },
  CUSTOM:     { w: 794,  h: 1123 },
};

const num = (v) => parseFloat(v || 0);
const fmtCurrency = (v) => `₹${num(v).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
const fmtWeight = (v) => `${num(v).toFixed(3)}g`;

const escapeHtml = (str) => String(str ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

/** Resolves every {{merge_field}} in `text` against `data` — missing fields become ''. */
export const resolveMergeFields = (text, data = {}) =>
  String(text ?? '').replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const v = data[key];
    return v === undefined || v === null || v === '' ? '' : String(v);
  });

const justifyFor = (align) => (align === 'center' ? 'center' : align === 'right' ? 'flex-end' : 'flex-start');

/**
 * Resolves QR data-URLs for every qr_code block ahead of render (async QR
 * generation, same off-screen-canvas approach as labelRenderer.js's
 * resolveQrDataUrls — kept separate since invoice blocks encode merge
 * fields, not a single ornament's Article_Number).
 */
export async function resolveInvoiceQrDataUrls(blocks, data = {}) {
  const qrBlocks = (blocks || []).filter((b) => b.type === 'qr_code');
  const entries = await Promise.all(
    qrBlocks.map(async (b) => [b.id, await generateQrDataUrl(resolveMergeFields(b.content?.data || '{{invoice_no}}', data), b.content?.size || 160)])
  );
  return Object.fromEntries(entries);
}

function renderItemsTable(content, data) {
  const columns = content?.columns?.length ? content.columns : ['#', 'Item', 'Purity', 'Gross Wt', 'Net Wt', 'Rate', 'Making', 'GST', 'Amount'];
  const items = data.items || [];
  const cellFor = (col, item, idx) => {
    switch (col.toLowerCase()) {
      case '#': return idx + 1;
      case 'item': return escapeHtml(item.item_name) + (content?.show_huid && item.huid ? `<br><small>HUID: ${escapeHtml(item.huid)}</small>` : '');
      case 'purity': return escapeHtml(item.purity || '-');
      case 'gross wt': return fmtWeight(item.gross_weight);
      case 'net wt': return fmtWeight(item.net_weight ?? item.gross_weight);
      case 'rate': return fmtCurrency(item.rate);
      case 'making': return fmtCurrency(item.making_charge);
      case 'gst': return fmtCurrency(item.gst_amount);
      case 'amount': return fmtCurrency(item.amount);
      default: return item[col] ?? '';
    }
  };
  return `
    <table style="width:100%; border-collapse:collapse; font-size:9pt;">
      <thead>
        <tr style="background:#B8860B; color:#fff;">
          ${columns.map((c) => `<th style="padding:5px 6px; text-align:left; font-size:8pt;">${escapeHtml(c)}</th>`).join('')}
        </tr>
      </thead>
      <tbody>
        ${items.map((item, idx) => `
          <tr style="border-bottom:1px solid #e0e0e0;">
            ${columns.map((c) => `<td style="padding:5px 6px;">${cellFor(c, item, idx)}</td>`).join('')}
          </tr>
        `).join('') || `<tr><td colspan="${columns.length}" style="padding:10px; text-align:center; color:#999;">No items</td></tr>`}
      </tbody>
    </table>
  `;
}

// Excel-style grid — a free-form spreadsheet block (see ExcelGridEditorModal
// in InvoiceStudio.jsx). Unlike items_table, this is never data-bound to a
// repeating array; every cell is a fixed position with its own static text
// and/or {{merge_field}}, resolved here exactly like a text block. Merged
// cells are simply omitted from their row's <td> list — standard HTML
// colspan/rowspan semantics, no separate "hidden cell" markup needed.
function renderExcelGrid(content, data) {
  const rows = content?.rows || [];
  const showBorders = content?.showBorders !== false;
  const fontSize = content?.fontSize || 10;
  return `
    <table style="border-collapse:collapse; width:100%; font-size:${fontSize}pt;">
      <tbody>
        ${rows.map((row) => `
          <tr style="height:${row.height || 22}px;">
            ${row.cells.filter((cell) => !cell.merged).map((cell) => `
              <td colspan="${cell.colspan || 1}" rowspan="${cell.rowspan || 1}"
                style="border:${showBorders ? '1px solid #999' : 'none'}; padding:3px 6px;
                  background:${cell.bg || 'transparent'}; font-weight:${cell.bold ? 700 : 400};
                  text-align:${cell.align || 'left'}; color:${cell.color || '#1a1a2e'};">
                ${escapeHtml(resolveMergeFields(cell.text, data))}
              </td>`).join('')}
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function renderTotals(content, data) {
  const rows = [
    content?.show_gold_value !== false && data.gold_value != null && ['Gold Value', data.gold_value],
    content?.show_making !== false && data.making_total != null && ['Making Charges', data.making_total],
    content?.show_stone && data.stone_value != null && ['Stone Value', data.stone_value],
    data.subtotal != null && ['Subtotal', data.subtotal],
    data.discount > 0 && ['Discount', -data.discount],
    content?.show_gst !== false && data.gst_amt != null && ['GST', data.gst_amt],
    content?.show_old_gold !== false && data.old_gold_value > 0 && ['Old Gold Exchange', -data.old_gold_value],
    content?.show_scheme !== false && data.scheme_adj > 0 && ['Scheme Adjustment', -data.scheme_adj],
    data.voucher_amt > 0 && ['Gift Voucher', -data.voucher_amt],
    data.round_off && ['Round Off', data.round_off],
  ].filter(Boolean);
  return `
    <table style="width:100%; border-collapse:collapse; font-size:9pt;">
      ${rows.map(([label, val]) => `
        <tr><td style="padding:3px 4px;">${escapeHtml(label)}</td><td style="padding:3px 4px; text-align:right;">${fmtCurrency(val)}</td></tr>
      `).join('')}
      <tr style="border-top:2px solid #B8860B; font-weight:700; font-size:11pt;">
        <td style="padding:6px 4px;">NET PAYABLE</td><td style="padding:6px 4px; text-align:right; color:#B8860B;">${fmtCurrency(data.net_payable)}</td>
      </tr>
    </table>
  `;
}

function renderBlock(b, data, qrDataUrls) {
  const pos = `position:absolute; left:${b.x}px; top:${b.y}px; width:${b.w}px; height:${b.h}px; box-sizing:border-box; overflow:hidden;`;
  const c = b.content || {};

  switch (b.type) {
    case 'logo':
    case 'image':
      return `<div style="${pos}">${c.url ? `<img src="${c.url}" style="max-width:100%; max-height:100%; object-fit:contain;" />` : ''}</div>`;

    case 'shop_header':
      return `<div style="${pos} display:flex; flex-direction:column; align-items:${c.align === 'center' ? 'center' : c.align === 'right' ? 'flex-end' : 'flex-start'}; justify-content:center; text-align:${c.align || 'center'}; font-size:${c.fontSize || 14}pt; font-weight:${c.bold ? 700 : 400}; white-space:pre-line;">${escapeHtml(resolveMergeFields(c.text, data))}</div>`;

    case 'invoice_meta': {
      const rows = [
        c.show_no !== false && data.invoice_no && `Invoice No: ${escapeHtml(data.invoice_no)}`,
        c.show_date !== false && data.invoice_date && `Date: ${escapeHtml(data.invoice_date)}`,
        c.show_type !== false && data.invoice_type && `Type: ${escapeHtml(data.invoice_type)}`,
      ].filter(Boolean);
      return `<div style="${pos} font-size:9pt; color:${c.label_color || '#333'};">${rows.join('<br>')}</div>`;
    }

    case 'customer': {
      const rows = [
        c.show_name !== false && data.customer_name && `<strong>${escapeHtml(data.customer_name)}</strong>`,
        c.show_mobile !== false && data.customer_mobile && `Mobile: ${escapeHtml(data.customer_mobile)}`,
        c.show_address !== false && data.customer_address && escapeHtml(data.customer_address),
        c.show_gst !== false && data.customer_gst && `GSTIN: ${escapeHtml(data.customer_gst)}`,
        c.show_pan !== false && data.customer_pan && `PAN: ${escapeHtml(data.customer_pan)}`,
      ].filter(Boolean);
      return `<div style="${pos} font-size:9pt;">${rows.join('<br>')}</div>`;
    }

    case 'items_table':
      return `<div style="${pos}">${renderItemsTable(c, data)}</div>`;

    case 'totals':
      return `<div style="${pos}">${renderTotals(c, data)}</div>`;

    case 'gst_block': {
      const rows = [
        c.show_cgst !== false && data.cgst != null && `CGST: ${fmtCurrency(data.cgst)}`,
        c.show_sgst !== false && data.sgst != null && `SGST: ${fmtCurrency(data.sgst)}`,
        c.show_igst && data.igst != null && `IGST: ${fmtCurrency(data.igst)}`,
      ].filter(Boolean);
      return `<div style="${pos} font-size:9pt;">${rows.join('<br>')}</div>`;
    }

    case 'gold_rate': {
      const rows = [
        c.show_22k !== false && data.gold_rate_22k && `22K: ${fmtCurrency(data.gold_rate_22k)}/g`,
        c.show_24k && data.gold_rate_24k && `24K: ${fmtCurrency(data.gold_rate_24k)}/g`,
        c.show_silver !== false && data.silver_rate && `Silver: ${fmtCurrency(data.silver_rate)}/g`,
      ].filter(Boolean);
      return `<div style="${pos} font-size:9pt; background:#FFF8E7; padding:4px 6px;">${rows.join(' | ')}</div>`;
    }

    case 'payment': {
      const rows = [
        c.show_mode !== false && data.payment_mode && `Payment Mode: ${escapeHtml(data.payment_mode)}`,
        c.show_ref !== false && data.payment_ref && `Ref: ${escapeHtml(data.payment_ref)}`,
        c.show_balance !== false && data.balance > 0 && `Balance Due: ${fmtCurrency(data.balance)}`,
      ].filter(Boolean);
      return `<div style="${pos} font-size:9pt;">${rows.join('<br>')}</div>`;
    }

    case 'old_gold': {
      const rows = [
        c.show_weight !== false && data.old_gold_wt > 0 && `Weight: ${fmtWeight(data.old_gold_wt)}`,
        c.show_value !== false && data.old_gold_value > 0 && `Value: ${fmtCurrency(data.old_gold_value)}`,
      ].filter(Boolean);
      return rows.length ? `<div style="${pos} font-size:9pt;">${rows.join('<br>')}</div>` : `<div style="${pos}"></div>`;
    }

    case 'scheme_block': {
      const rows = [
        c.show_name !== false && data.scheme_name && `Scheme: ${escapeHtml(data.scheme_name)}`,
        c.show_balance !== false && data.scheme_adj > 0 && `Adjustment: ${fmtCurrency(data.scheme_adj)}`,
      ].filter(Boolean);
      return rows.length ? `<div style="${pos} font-size:9pt;">${rows.join('<br>')}</div>` : `<div style="${pos}"></div>`;
    }

    case 'karigar_table': {
      const columns = c.columns?.length ? c.columns : ['Item', 'Issued Wt', 'Return Wt', 'Wastage', 'Wages'];
      return `<div style="${pos}"><table style="width:100%; border-collapse:collapse; font-size:9pt;"><thead><tr style="background:#B8860B; color:#fff;">${columns.map((h) => `<th style="padding:4px;">${escapeHtml(h)}</th>`).join('')}</tr></thead></table></div>`;
    }

    case 'bank_details': {
      const rows = [
        c.show_account !== false && data.bank_account && `A/C: ${escapeHtml(data.bank_account)}`,
        c.show_ifsc !== false && data.bank_ifsc && `IFSC: ${escapeHtml(data.bank_ifsc)}`,
        c.show_upi !== false && data.bank_upi && `UPI: ${escapeHtml(data.bank_upi)}`,
      ].filter(Boolean);
      return rows.length ? `<div style="${pos} font-size:8pt; color:#666;">${rows.join('<br>')}</div>` : `<div style="${pos}"></div>`;
    }

    case 'terms':
      return `<div style="${pos} font-size:7pt; color:#666; white-space:pre-line;">${escapeHtml(resolveMergeFields(c.text, data))}</div>`;

    case 'signature':
      return `<div style="${pos} display:flex; flex-direction:column; justify-content:flex-end; text-align:center; font-size:9pt;">
        ${c.show_stamp ? '<div style="height:40px;"></div>' : ''}
        <div style="border-top:1px solid #333; padding-top:4px;">${escapeHtml(c.label || 'Authorised Signatory')}</div>
      </div>`;

    case 'stamp':
      return `<div style="${pos} display:flex; align-items:center; justify-content:center; border:2px solid ${c.color || '#B8860B'}; border-radius:50%; color:${c.color || '#B8860B'}; font-weight:700; font-size:9pt; transform:rotate(-12deg);">${escapeHtml(c.text || 'RECEIVED')}</div>`;

    case 'qr_code': {
      const src = qrDataUrls?.[b.id] || '';
      return `<div style="${pos} display:flex; align-items:center; justify-content:center;">${src ? `<img src="${src}" style="width:100%; height:100%; object-fit:contain;" />` : ''}</div>`;
    }

    case 'barcode':
      return `<div style="${pos} display:flex; align-items:center; justify-content:center; font-family:monospace; font-size:8pt; border:1px solid #ccc;">${escapeHtml(resolveMergeFields(c.data, data))}</div>`;

    case 'text': {
      const text = escapeHtml(resolveMergeFields(c.text, data));
      return `<div style="${pos} display:flex; align-items:center; justify-content:${justifyFor(c.align)}; text-align:${c.align || 'left'}; font-size:${c.fontSize || 12}pt; font-weight:${c.bold ? 700 : 400}; color:${c.color || '#333'};">${text}</div>`;
    }

    case 'line':
      return `<div style="${pos} border-top:${c.thickness || 1}px ${c.style || 'solid'} ${c.color || '#B8860B'};"></div>`;

    case 'rectangle':
      return `<div style="${pos} background:${c.fillColor || 'transparent'}; border:${c.borderWidth || 1}px solid ${c.borderColor || '#B8860B'}; border-radius:${c.borderRadius || 0}px;"></div>`;

    case 'excel_grid':
      return `<div style="${pos} overflow:auto;">${renderExcelGrid(c, data)}</div>`;

    default:
      return `<div style="${pos}"></div>`;
  }
}

/**
 * THE single shared renderer — blocks (from an Invoice Studio template) +
 * real data -> an HTML string sized in real px (matches Invoice Studio's own
 * canvas unit — see PAPER_SIZES above). qrDataUrls comes from
 * resolveInvoiceQrDataUrls(), called once ahead of render since QR
 * generation is async.
 */
export function renderInvoiceHTML(blocks, canvasWidthPx, canvasHeightPx, data = {}, qrDataUrls = {}) {
  const blockHtml = (blocks || []).map((b) => renderBlock(b, data, qrDataUrls)).join('');
  return `<div style="position:relative; width:${canvasWidthPx}px; height:${canvasHeightPx}px; background:#fff; font-family:Arial, sans-serif; color:#1a1a2e;">${blockHtml}</div>`;
}

/** Wraps renderInvoiceHTML()'s output in a standalone print document. */
export function buildInvoicePrintDocument(blocks, canvasWidthPx, canvasHeightPx, data, qrDataUrls) {
  const body = renderInvoiceHTML(blocks, canvasWidthPx, canvasHeightPx, data, qrDataUrls);
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8" />
<title>${escapeHtml(data.invoice_no || 'Invoice')}</title>
<style>
  @page { size: ${canvasWidthPx}px ${canvasHeightPx}px; margin: 0; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { width: ${canvasWidthPx}px; }
</style>
</head>
<body>${body}</body>
</html>`;
}
