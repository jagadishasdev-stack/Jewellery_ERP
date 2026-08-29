const puppeteer = require('puppeteer');
const db = require('../db/knex');
const { computeClosingReport } = require('./closingReportService');

/**
 * Generates a PDF for a sale using the tenant's invoice template.
 * Falls back to the global template if no tenant-specific one exists.
 */
const generateInvoicePDF = async (tenantId, documentType, saleId) => {
  // 1. Get template
  let template = await db('tbl_invoice_template_master')
    .where({ Tenant_ID: tenantId, Document_Type: documentType, Is_Active: true })
    .orderBy('Is_Default', 'desc')
    .first();

  if (!template) {
    template = await db('tbl_invoice_template_master')
      .whereNull('Tenant_ID')
      .where({ Document_Type: documentType, Is_Active: true })
      .first();
  }

  // 2. Get sale data
  const sale = await db('tbl_sales_header as s')
    .leftJoin('tbl_customer_master as c', 's.Customer_ID', 'c.Customer_ID')
    .where({ 's.Sale_ID': saleId })
    .select('s.*', 'c.Email as Customer_Email', 'c.Date_Of_Birth', 'c.Address_Line1', 'c.City')
    .first();

  if (!sale) throw new Error('Sale not found');

  const items = await db('tbl_sales_details').where({ Sale_ID: saleId });

  const tenant = await db('tbl_tenant_master').where({ Tenant_ID: tenantId }).first();

  // 3. Build HTML
  const html = buildInvoiceHTML(sale, items, tenant, template);

  // 4. Generate PDF using Puppeteer
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });

    const pdfBuffer = await page.pdf({
      format: template?.Paper_Size === 'A5' ? 'A5' : 'A4',
      printBackground: true,
      margin: { top: '15mm', bottom: '15mm', left: '10mm', right: '10mm' },
    });

    return pdfBuffer;
  } finally {
    await browser.close();
  }
};

const buildInvoiceHTML = (sale, items, tenant, template) => {
  const primaryColor = template?.Primary_Color || '#B8860B';
  const fontFamily = template?.Font_Family || 'Arial';
  const headerText = template?.Header_Text || {};
  const fieldLabels = template?.Field_Labels || {};
  const showGST = template?.Show_GST_Breakdown !== false;
  const showHallmark = template?.Show_Hallmark_Number !== false;
  const customCSS = template?.Custom_CSS || '';

  const formatCurrency = (val) =>
    '₹' + parseFloat(val || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });
  const formatWeight = (val) => parseFloat(val || 0).toFixed(3) + 'g';
  const formatDate = (d) => d ? new Date(d).toLocaleDateString('en-IN') : '-';

  const itemRows = items.map((item, idx) => `
    <tr>
      <td>${idx + 1}</td>
      <td>${item.Item_Type_Name || '-'} ${item.Article_Number ? `<br><small>${item.Article_Number}</small>` : ''}</td>
      <td>${item.Purity_Code || '-'}</td>
      <td>${formatWeight(item.Gross_Weight)}</td>
      <td>${formatCurrency(item.Gold_Rate_Per_Gram)}/g</td>
      <td>${formatCurrency(item.Making_Charge_Applied)}</td>
      ${template?.Show_Wastage_Column ? `<td>${formatCurrency(item.Wastage_Amount_Applied)}</td>` : ''}
      <td>${item.Discount_Amount_Applied > 0 ? formatCurrency(item.Discount_Amount_Applied) : '-'}</td>
      <td>${formatCurrency(item.Taxable_Value)}</td>
      <td>${formatCurrency(item.Total_Line_Price)}</td>
    </tr>
  `).join('');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: ${fontFamily}, sans-serif; font-size: 10pt; color: #1A1A1A; }
    .invoice { max-width: 800px; margin: 0 auto; padding: 20px; }
    .header { text-align: center; border-bottom: 2px solid ${primaryColor}; padding-bottom: 15px; margin-bottom: 15px; }
    .company-name { font-size: 24pt; font-weight: bold; color: ${primaryColor}; }
    .invoice-title { font-size: 14pt; color: ${primaryColor}; text-align: center; margin: 10px 0; letter-spacing: 3px; }
    .meta-row { display: flex; justify-content: space-between; margin-bottom: 15px; padding: 10px; background: #f9f9f9; border-radius: 4px; }
    table { width: 100%; border-collapse: collapse; margin: 15px 0; }
    th { background: ${primaryColor}; color: white; padding: 8px; text-align: left; font-size: 9pt; }
    td { padding: 7px 8px; border-bottom: 1px solid #e0e0e0; font-size: 9pt; }
    tr:nth-child(even) { background: #fafafa; }
    .totals { margin-left: auto; width: 300px; margin-top: 10px; }
    .totals tr td { padding: 5px 8px; }
    .totals .grand-total td { font-size: 13pt; font-weight: bold; color: ${primaryColor}; border-top: 2px solid ${primaryColor}; }
    .footer { margin-top: 30px; border-top: 1px solid #ddd; padding-top: 15px; font-size: 8pt; color: #666; text-align: center; }
    .signature-box { margin-top: 40px; display: flex; justify-content: space-between; }
    .sig-line { border-top: 1px solid #333; width: 180px; text-align: center; padding-top: 5px; font-size: 9pt; }
    ${customCSS}
  </style>
</head>
<body>
  <div class="invoice">
    <div class="header">
      <div class="company-name">${tenant?.Company_Name || headerText.line1 || 'Jewellery Store'}</div>
      ${headerText.line2 ? `<div>${headerText.line2}</div>` : ''}
      <div>${[tenant?.Address_Line1, tenant?.City, tenant?.State].filter(Boolean).join(', ')}</div>
      ${tenant?.GST_No ? `<div>GST: ${tenant.GST_No}</div>` : ''}
      ${tenant?.Phone ? `<div>Ph: ${tenant.Phone}${tenant?.Email ? ' | ' + tenant.Email : ''}</div>` : ''}
    </div>

    <div class="invoice-title">${sale.Invoice_Type || 'TAX INVOICE'}</div>

    <div class="meta-row">
      <div>
        <strong>Invoice No:</strong> ${sale.Invoice_Number}<br>
        <strong>Date:</strong> ${formatDate(sale.Sale_Date)}<br>
        <strong>Sale Type:</strong> ${sale.Sale_Type}
      </div>
      <div>
        <strong>Customer:</strong> ${sale.Customer_Name || 'Walk-in'}<br>
        <strong>Mobile:</strong> ${sale.Customer_Mobile || '-'}<br>
        ${showHallmark && sale.GST_Invoice_No ? `<strong>GST Invoice:</strong> ${sale.GST_Invoice_No}` : ''}
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>Item</th>
          <th>Purity</th>
          <th>${fieldLabels.grossWeight || 'Gross Wt'}</th>
          <th>Rate/g</th>
          <th>${fieldLabels.makingCharge || 'M/C'}</th>
          ${template?.Show_Wastage_Column ? '<th>Wastage</th>' : ''}
          <th>Discount</th>
          <th>Taxable</th>
          <th>Amount</th>
        </tr>
      </thead>
      <tbody>${itemRows}</tbody>
    </table>

    <table class="totals">
      <tr><td>Subtotal</td><td style="text-align:right">${formatCurrency(sale.Subtotal_Amount)}</td></tr>
      ${sale.Discount_Amount > 0 ? `<tr><td>Discount</td><td style="text-align:right">- ${formatCurrency(sale.Discount_Amount)}</td></tr>` : ''}
      ${showGST ? `<tr><td>GST (${sale.GST_Percentage}%)</td><td style="text-align:right">${formatCurrency(sale.GST_Amount)}</td></tr>` : ''}
      ${sale.Round_Off_Amount ? `<tr><td>Round Off</td><td style="text-align:right">${formatCurrency(sale.Round_Off_Amount)}</td></tr>` : ''}
      ${sale.Old_Gold_Exchange_Amount > 0 ? `<tr><td>Old Gold Exchange</td><td style="text-align:right">- ${formatCurrency(sale.Old_Gold_Exchange_Amount)}</td></tr>` : ''}
      <tr class="grand-total"><td><strong>NET PAYABLE</strong></td><td style="text-align:right"><strong>${formatCurrency(sale.Net_Payable_Amount)}</strong></td></tr>
      <tr><td>Amount Paid</td><td style="text-align:right">${formatCurrency(sale.Amount_Paid)}</td></tr>
      ${sale.Balance_Amount > 0 ? `<tr><td><strong>Balance</strong></td><td style="text-align:right"><strong>${formatCurrency(sale.Balance_Amount)}</strong></td></tr>` : ''}
    </table>

    <div>
      <strong>Payment Mode:</strong> ${sale.Payment_Mode || '-'}
      ${sale.Payment_Reference ? ` | Ref: ${sale.Payment_Reference}` : ''}
    </div>

    <div class="signature-box">
      <div class="sig-line">For ${tenant?.Company_Name || 'Authorised Signatory'}</div>
      <div class="sig-line">${template?.Signature_Field_Label || 'Customer Signature'}</div>
    </div>

    <div class="footer">
      ${template?.Footer_Text?.terms || 'Goods once sold cannot be returned. E.& O.E.'}
      ${template?.Footer_Text?.bank ? `<br>${template.Footer_Text.bank}` : ''}
    </div>
  </div>
</body>
</html>`;
};

/**
 * Generates Karigar Settlement PDF
 */
const generateKarigarSettlementPDF = async (tenantId, karigarId, fromDate, toDate) => {
  const karigar = await db('tbl_vendor_master').where({ Vendor_ID: karigarId }).first();
  const tenant = await db('tbl_tenant_master').where({ Tenant_ID: tenantId }).first();

  const issues = await db('tbl_issue_to_karigar as i')
    .join('tbl_return_from_karigar as r', 'i.Issue_ID', 'r.Issue_ID')
    .where('i.Tenant_ID', tenantId)
    .where('i.Karigar_ID', karigarId)
    .whereBetween('r.Return_Date', [fromDate, toDate])
    .select('i.Issue_Date', 'i.Gold_Weight_Issued', 'i.Karigar_Wages_Rate', 'r.Gross_Weight_Returned', 'r.Wastage_Weight');

  const totals = issues.reduce((acc, r) => {
    acc.issued += parseFloat(r.Gold_Weight_Issued);
    acc.returned += parseFloat(r.Gross_Weight_Returned);
    acc.wastage += parseFloat(r.Wastage_Weight || 0);
    acc.grossWages += parseFloat(r.Gross_Weight_Returned) * parseFloat(r.Karigar_Wages_Rate || 0);
    acc.wastageDeduction += parseFloat(r.Wastage_Weight || 0) * parseFloat(r.Karigar_Wages_Rate || 0);
    return acc;
  }, { issued: 0, returned: 0, wastage: 0, grossWages: 0, wastageDeduction: 0 });
  totals.netWages = totals.grossWages - totals.wastageDeduction;

  const html = buildKarigarSettlementHTML(karigar, tenant, issues, totals, fromDate, toDate);

  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    return await page.pdf({ format: 'A4', printBackground: true });
  } finally {
    await browser.close();
  }
};

const buildKarigarSettlementHTML = (karigar, tenant, issues, totals, fromDate, toDate) => `
<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>
  body { font-family: Arial, sans-serif; font-size: 10pt; }
  .title { text-align: center; font-size: 16pt; font-weight: bold; color: #B8860B; margin-bottom: 5px; }
  .company { text-align: center; font-size: 12pt; margin-bottom: 15px; }
  table { width: 100%; border-collapse: collapse; margin: 15px 0; }
  th { background: #B8860B; color: white; padding: 8px; }
  td { padding: 7px; border-bottom: 1px solid #ddd; }
  .total-row { font-weight: bold; background: #f5f5f5; }
  .summary { margin-top: 20px; padding: 15px; background: #f9f9f9; border-radius: 4px; }
  .net-pay { font-size: 14pt; font-weight: bold; color: #B8860B; border-top: 2px solid #B8860B; padding-top: 10px; }
</style></head><body>
  <div class="title">KARIGAR SETTLEMENT BILL</div>
  <div class="company">${tenant?.Company_Name || ''}</div>
  <table style="width:auto;margin-bottom:20px">
    <tr><td><strong>Karigar Name:</strong></td><td>${karigar?.Vendor_Name}</td></tr>
    <tr><td><strong>Karigar ID:</strong></td><td>${karigar?.Vendor_Code}</td></tr>
    <tr><td><strong>Settlement Period:</strong></td><td>${new Date(fromDate).toLocaleDateString('en-IN')} to ${new Date(toDate).toLocaleDateString('en-IN')}</td></tr>
  </table>
  <table>
    <thead><tr><th>Issue Date</th><th>Gold Issued (g)</th><th>Returned (g)</th><th>Wastage (g)</th><th>Wages Rate</th><th>Deduction</th></tr></thead>
    <tbody>
      ${issues.map((r) => `<tr>
        <td>${new Date(r.Issue_Date).toLocaleDateString('en-IN')}</td>
        <td>${parseFloat(r.Gold_Weight_Issued).toFixed(3)}</td>
        <td>${parseFloat(r.Gross_Weight_Returned).toFixed(3)}</td>
        <td>${parseFloat(r.Wastage_Weight || 0).toFixed(3)}</td>
        <td>₹${r.Karigar_Wages_Rate}/g</td>
        <td>₹${(parseFloat(r.Wastage_Weight || 0) * parseFloat(r.Karigar_Wages_Rate || 0)).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
      </tr>`).join('')}
      <tr class="total-row">
        <td>TOTAL</td>
        <td>${totals.issued.toFixed(3)}</td>
        <td>${totals.returned.toFixed(3)}</td>
        <td>${totals.wastage.toFixed(3)}</td>
        <td>-</td>
        <td>₹${totals.wastageDeduction.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
      </tr>
    </tbody>
  </table>
  <div class="summary">
    <table style="width:350px">
      <tr><td>Gross Wages (${totals.returned.toFixed(3)}g)</td><td style="text-align:right">₹${totals.grossWages.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td></tr>
      <tr><td>Less: Wastage Deduction</td><td style="text-align:right">- ₹${totals.wastageDeduction.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td></tr>
      <tr class="net-pay"><td><strong>NET PAYABLE</strong></td><td style="text-align:right"><strong>₹${totals.netWages.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong></td></tr>
    </table>
  </div>
  <div style="margin-top:50px;display:flex;justify-content:space-between">
    <div style="border-top:1px solid #333;width:180px;text-align:center;padding-top:5px">For ${tenant?.Company_Name}</div>
    <div style="border-top:1px solid #333;width:180px;text-align:center;padding-top:5px">Karigar Signature</div>
  </div>
</body></html>`;

/**
 * Generates the Closing Report PDF (date-range inventory reconciliation,
 * see services/closingReportService.js for the underlying calculation).
 */
const generateClosingReportPDF = async ({ tenantId, req, fromDate, toDate, metal }) => {
  const tenant = await db('tbl_tenant_master').where({ Tenant_ID: tenantId }).first();
  const report = await computeClosingReport({ tenantId, req, fromDate, toDate, metal });

  const html = buildClosingReportHTML(tenant, report);

  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    return await page.pdf({ format: 'A4', printBackground: true, landscape: true, margin: { top: '10mm', bottom: '10mm', left: '8mm', right: '8mm' } });
  } finally {
    await browser.close();
  }
};

const buildClosingReportHTML = (tenant, report) => {
  const fmtWt = (v) => parseFloat(v || 0).toFixed(3) + 'g';
  const fmtDate = (d) => new Date(d).toLocaleDateString('en-IN');

  // Extended from 5 components to the full 12 the Transaction Menu spec
  // names — see closingReportService.js's own comment for exactly which
  // 12, and why Purchase Return isn't among them.
  const cols = [
    ['itemType', 'Item Type'], ['metal', 'Metal'],
    ['openingWeight', 'Opening Wt'], ['openingPieces', 'Opening Pcs'],
    ['addWeight', 'Add Wt'], ['addPieces', 'Add Pcs'],
    ['salesReturnWeight', 'Sales Return Wt'], ['salesReturnPieces', 'Sales Return Pcs'],
    ['soldWeight', 'Sold Wt'], ['soldPieces', 'Sold Pcs'],
    ['approvalIssueWeight', 'Appr. Issue Wt'], ['approvalIssuePieces', 'Appr. Issue Pcs'],
    ['approvalReceiveWeight', 'Appr. Receive Wt'], ['approvalReceivePieces', 'Appr. Receive Pcs'],
    ['workshopIssueWeight', 'Workshop Issue Wt'], ['workshopIssuePieces', 'Workshop Issue Pcs'],
    ['workshopReceiveWeight', 'Workshop Receive Wt'], ['workshopReceivePieces', 'Workshop Receive Pcs'],
    ['interbranchIssueWeight', 'Interbranch Issue Wt'], ['interbranchIssuePieces', 'Interbranch Issue Pcs'],
    ['interbranchReceiveWeight', 'Interbranch Receive Wt'], ['interbranchReceivePieces', 'Interbranch Receive Pcs'],
    ['closingWeight', 'Closing Wt'], ['closingPieces', 'Closing Pcs'],
    ['tags', 'Tags'],
  ];
  const isWeightCol = (key) => key.toLowerCase().includes('weight');

  const rowHtml = (row) => `<tr>${cols.map(([key]) => {
    if (key === 'itemType' || key === 'metal') return `<td>${row[key]}</td>`;
    return `<td style="text-align:right">${isWeightCol(key) ? fmtWt(row[key]) : row[key]}</td>`;
  }).join('')}</tr>`;

  const totalRowHtml = () => `<tr class="total-row"><td>TOTAL</td><td></td>${cols.slice(2).map(([key]) => {
    const v = report.totals[key];
    return `<td style="text-align:right">${isWeightCol(key) ? fmtWt(v) : v}</td>`;
  }).join('')}</tr>`;

  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>
  body { font-family: Arial, sans-serif; font-size: 8pt; }
  .title { text-align: center; font-size: 15pt; font-weight: bold; color: #B8860B; margin-bottom: 4px; }
  .company { text-align: center; font-size: 11pt; margin-bottom: 4px; }
  .meta { text-align: center; font-size: 9pt; color: #555; margin-bottom: 14px; }
  table { width: 100%; border-collapse: collapse; }
  th { background: #B8860B; color: white; padding: 5px 4px; font-size: 7.5pt; }
  td { padding: 4px; border-bottom: 1px solid #ddd; font-size: 8pt; }
  tr:nth-child(even) { background: #fafafa; }
  .total-row { font-weight: bold; background: #FDF6E3 !important; border-top: 2px solid #B8860B; }
</style></head><body>
  <div class="title">CLOSING REPORT</div>
  <div class="company">${tenant?.Company_Name || ''}</div>
  <div class="meta">${fmtDate(report.fromDate)} to ${fmtDate(report.toDate)} · Metal: ${report.metal}</div>
  <table>
    <thead><tr>${cols.map(([, label]) => `<th>${label}</th>`).join('')}</tr></thead>
    <tbody>
      ${report.rows.map(rowHtml).join('')}
      ${totalRowHtml()}
    </tbody>
  </table>
  ${report.meltConsumption && (report.meltConsumption.pieces > 0 || report.meltConsumption.weight > 0) ? `
  <div class="meta" style="margin-top:12px;">
    Melt Consumption (all metals, this period): ${fmtWt(report.meltConsumption.weight)} across ${report.meltConsumption.pieces} entr${report.meltConsumption.pieces === 1 ? 'y' : 'ies'}
    — a melt has no single item type to attribute it to, so it isn't a column in the grid above.
  </div>` : ''}
</body></html>`;
};

module.exports = { generateInvoicePDF, generateKarigarSettlementPDF, generateClosingReportPDF };
