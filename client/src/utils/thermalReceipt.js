import { formatCurrency, formatWeight } from './calculations';
import { printHTML, isQZConnected, openPrintWindow, writeAndPrint } from './printService';
import { buildDefaultLabelBlocks, buildLabelPrintDocument, resolveQrDataUrls } from './labelRenderer';
import { PAPER_SIZES, buildInvoicePrintDocument, resolveInvoiceQrDataUrls } from './invoiceRenderer';
import api from '../api/axios';
import dayjs from 'dayjs';

/**
 * Resolves the tenant's active Invoice Studio template for `docType` (e.g.
 * 'SALES_BILL', 'ESTIMATE', 'ORDER_BOOKING') and, if one exists, prints
 * `data` through it via invoiceRenderer.js. Returns true if it printed
 * (caller should skip its own hardcoded fallback), false if no template is
 * set up for this tenant/document type yet (caller should fall back).
 */
export const printFromInvoiceStudio = async (docType, data) => {
  let blocks = null, paperKey = 'A4';
  try {
    const res = await api.get(`/invoice-studio/resolve/${docType}`);
    const row = res.data?.data;
    const parsed = typeof row?.Components === 'string' ? JSON.parse(row.Components) : row?.Components;
    if (parsed?.length) {
      blocks = parsed;
      paperKey = row.Paper_Size || 'A4';
    }
  } catch {
    // No active template for this tenant/document type — caller falls back.
  }
  if (!blocks) return false;

  const paper = PAPER_SIZES[paperKey] || PAPER_SIZES.A4;
  const role = paperKey === 'THERMAL_80' || paperKey === 'THERMAL_58' ? 'thermal_receipt' : 'regular';
  const connected = isQZConnected();
  const printWindow = connected ? null : openPrintWindow('width=500,height=700');

  const qrDataUrls = await resolveInvoiceQrDataUrls(blocks, data);
  const html = buildInvoicePrintDocument(blocks, paper.w, paper.h, data, qrDataUrls);

  if (connected) printHTML(role, html);
  else writeAndPrint(printWindow, html);
  return true;
};

/**
 * Generates and prints a thermal receipt (80mm) for a sale — routed through
 * the 'thermal_receipt' printer role (silent via QZ Tray if configured, or
 * the standard print dialog otherwise).
 *
 * If the tenant has an active Invoice Studio template for SALES_BILL, that
 * design is used instead (with real sale data) — this hardcoded plain-text
 * layout only runs as the fallback for tenants who haven't designed one yet.
 */
export const printThermalReceipt = async (sale, items, tenant) => {
  const studioData = {
    shop_name: tenant?.Company_Name, shop_address: tenant?.Address, shop_city: tenant?.City,
    shop_phone: tenant?.Phone, shop_gst: tenant?.GST_No,
    invoice_no: sale.Invoice_Number, invoice_date: dayjs(sale.Sale_Date).format('DD-MMM-YYYY HH:mm'),
    invoice_type: sale.Sale_Type, counter_name: sale.Counter_Name,
    customer_name: sale.Customer_Name || 'Walk-in', customer_mobile: sale.Customer_Mobile,
    items: items.map((item) => ({
      item_name: item.Item_Type_Name || 'Item', purity: item.Purity_Code,
      gross_weight: item.Gross_Weight, net_weight: item.Net_Gold_Weight || item.Gross_Weight,
      rate: item.Gold_Rate_Per_Gram, making_charge: item.Making_Charge_Applied,
      gst_amount: item.GST_Amount, huid: item.HUID_Number, amount: item.Total_Line_Price,
    })),
    subtotal: sale.Subtotal_Amount, discount: sale.Discount_Amount, gst_amt: sale.GST_Amount,
    old_gold_value: sale.Old_Gold_Exchange_Amount, scheme_adj: sale.Scheme_Adjustment_Amount,
    voucher_amt: sale.Voucher_Amount, round_off: sale.Round_Off_Amount, net_payable: sale.Net_Payable_Amount,
    payment_mode: sale.Payment_Mode, payment_ref: sale.Payment_Reference,
    amount_paid: sale.Amount_Paid, balance: sale.Balance_Amount,
  };
  if (await printFromInvoiceStudio('SALES_BILL', studioData)) return;

  const MAX_CHARS = 48;
  const divider = '-'.repeat(MAX_CHARS);
  const doubleLine = '='.repeat(MAX_CHARS);
  const center = (text) => {
    const pad = Math.max(0, Math.floor((MAX_CHARS - text.length) / 2));
    return ' '.repeat(pad) + text;
  };

  const lines = [];
  lines.push(center(tenant?.Company_Name || 'JEWELLERY STORE'));
  if (tenant?.GST_No) lines.push(center(`GST: ${tenant.GST_No}`));
  if (tenant?.Phone) lines.push(center(`Ph: ${tenant.Phone}`));
  lines.push(doubleLine);
  lines.push(`Bill No : ${sale.Invoice_Number}`);
  lines.push(`Date    : ${dayjs(sale.Sale_Date).format('DD-MMM-YYYY HH:mm')}`);
  lines.push(`Customer: ${sale.Customer_Name || 'Walk-in'}`);
  if (sale.Customer_Mobile) lines.push(`Mobile  : ${sale.Customer_Mobile}`);
  lines.push(divider);
  lines.push(`${'Item'.padEnd(22)} ${'Wt'.padStart(7)} ${'Amt'.padStart(10)}`);
  lines.push(divider);

  items.forEach((item) => {
    const name = (item.Item_Type_Name || 'Item').substring(0, 20);
    const grossWt = formatWeight(item.Gross_Weight);
    const netWt   = formatWeight(
      parseFloat(item.Net_Gold_Weight || item.Gross_Weight || 0)
    );
    const amount = `₹${parseFloat(item.Total_Line_Price || 0).toLocaleString('en-IN')}`;
    lines.push(`${name.padEnd(22)} ${grossWt.padStart(7)} ${amount.padStart(10)}`);
    lines.push(`  Net Gold Wt: ${netWt.padStart(8)} | ${item.Purity_Code || '-'}`);
    lines.push(`  Rate: ₹${parseFloat(item.Gold_Rate_Per_Gram || 0).toLocaleString('en-IN')}/g`);
    if (parseFloat(item.Making_Charge_Applied || 0) > 0) {
      lines.push(`  Making: ₹${parseFloat(item.Making_Charge_Applied).toLocaleString('en-IN')}`);
    }
    lines.push('');
  });

  lines.push(divider);
  lines.push(`Subtotal  : ${formatCurrency(sale.Subtotal_Amount).padStart(15)}`);
  if (parseFloat(sale.Discount_Amount || 0) > 0) {
    lines.push(`Discount  : ${('-' + formatCurrency(sale.Discount_Amount)).padStart(15)}`);
  }
  lines.push(`GST (3%)  : ${formatCurrency(sale.GST_Amount).padStart(15)}`);
  if (parseFloat(sale.Old_Gold_Exchange_Amount || 0) > 0) {
    lines.push(`Old Gold  : ${('-' + formatCurrency(sale.Old_Gold_Exchange_Amount)).padStart(15)}`);
  }
  if (parseFloat(sale.Scheme_Adjustment_Amount || 0) > 0) {
    lines.push(`Scheme Adj: ${('-' + formatCurrency(sale.Scheme_Adjustment_Amount)).padStart(15)}`);
  }
  if (parseFloat(sale.Voucher_Amount || 0) > 0) {
    lines.push(`Voucher   : ${('-' + formatCurrency(sale.Voucher_Amount)).padStart(15)}`);
  }
  lines.push(doubleLine);
  lines.push(`TOTAL     : ${formatCurrency(sale.Net_Payable_Amount).padStart(15)}`);
  lines.push(doubleLine);
  lines.push(`Gross Wt  : ${formatWeight(sale.Total_Gross_Weight || 0).padStart(15)}`);
  lines.push(`Net Gold  : ${formatWeight(sale.Total_Net_Gold_Weight || 0).padStart(15)}`);
  lines.push(divider);
  lines.push(`Payment   : ${sale.Payment_Mode || '-'}`);
  if (sale.Payment_Reference) lines.push(`Ref       : ${sale.Payment_Reference}`);
  lines.push('');
  lines.push(center('Thank You! Visit Again'));
  lines.push(center('E. & O.E.'));
  lines.push('');
  lines.push('');

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        @page { margin: 0; size: 80mm auto; }
        body {
          font-family: 'Courier New', Courier, monospace;
          font-size: 11pt;
          width: 80mm;
          margin: 2mm;
          white-space: pre;
          line-height: 1.3;
        }
        @media print { body { margin: 0; } }
      </style>
    </head>
    <body>${lines.join('\n')}</body>
    </html>
  `;
  await printHTML('thermal_receipt', html, { windowSize: 'width=400,height=600' });
};

// Fallback layout used only if the tenant hasn't designed/saved a label in
// the Label Designer yet (client/src/pages/admin/LabelDesignerPage.jsx).
const DEFAULT_LABEL_WIDTH_MM = 60;
const DEFAULT_LABEL_HEIGHT_MM = 40;

/**
 * Prints a barcode/RFID label for an ornament, using the tenant's saved
 * Label Designer template (falls back to a built-in default layout if none
 * has been saved yet) — routed through the 'thermal_label' printer role
 * (silent via QZ Tray if configured, or the standard print dialog otherwise).
 * The QR encodes the Article_Number — scans into the same barcode/search
 * fields a CODE128 barcode would, just faster and more scan-tolerant.
 */
export const printBarcodeLabel = async (ornament, shopName) => {
  // If QZ Tray isn't connected, open the window synchronously now — same
  // tick as the click — so popup blockers don't treat the later async
  // template/QR work as an untrusted, non-gesture action. If QZ IS
  // connected, no window is ever needed — printHTML() prints silently.
  const connected = isQZConnected();
  const printWindow = connected ? null : openPrintWindow('width=300,height=260');

  let widthMm = DEFAULT_LABEL_WIDTH_MM, heightMm = DEFAULT_LABEL_HEIGHT_MM, blocks = null;
  try {
    const res = await api.get('/invoice-studio/resolve/BARCODE_LABEL');
    const raw = res.data?.data?.Components;
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (parsed?.blocks?.length) {
      widthMm = parsed.canvasWidthMm || widthMm;
      heightMm = parsed.canvasHeightMm || heightMm;
      blocks = parsed.blocks;
    }
  } catch {
    // No saved label template yet — fall back to the built-in default layout.
  }
  if (!blocks) blocks = buildDefaultLabelBlocks(widthMm, heightMm);

  const data = { ...ornament, Shop_Name: shopName };
  const qrDataUrls = await resolveQrDataUrls(blocks, data);
  const html = buildLabelPrintDocument(blocks, widthMm, heightMm, data, qrDataUrls);

  if (connected) printHTML('thermal_label', html);
  else writeAndPrint(printWindow, html);
};
