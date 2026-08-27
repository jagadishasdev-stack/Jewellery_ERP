/**
 * Plain on-screen voucher print for Approval Issue/Receive (tagged + non-tag).
 * Phase-1 stopgap — routed through the 'other' printer role (the spec's
 * catch-all for documents with no more specific role of their own; silent
 * via QZ Tray if configured, browser print dialog otherwise). No Invoice
 * Studio template involved yet.
 */
import { printHTML } from './printService';
import { formatCurrency, formatWeight } from './calculations';
import dayjs from 'dayjs';

const fmtDate = (d) => (d ? dayjs(d).format('DD-MMM-YYYY') : '—');

const voucherShell = (title, voucherNumber, bodyHtml) => `
<!DOCTYPE html><html><head><title>${voucherNumber}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; padding: 24px; color: #222; }
  h1 { font-size: 18px; margin: 0 0 2px; color: #B8860B; }
  h2 { font-size: 13px; margin: 0 0 16px; color: #666; font-weight: normal; }
  .voucher-no { font-size: 15px; font-weight: bold; font-family: monospace; margin-bottom: 4px; }
  .meta-row { display: flex; justify-content: space-between; margin-bottom: 16px; font-size: 12px; }
  .meta-col { width: 48%; }
  .meta-col b { display: block; color: #888; font-size: 10px; text-transform: uppercase; margin-bottom: 2px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
  th, td { border: 1px solid #ddd; padding: 6px 8px; font-size: 11px; text-align: left; }
  th { background: #faf6ee; color: #B8860B; }
  tfoot td { font-weight: bold; background: #fafafa; }
  .signatures { display: flex; justify-content: space-between; margin-top: 60px; }
  .sig-box { width: 45%; border-top: 1px solid #333; padding-top: 4px; font-size: 11px; text-align: center; }
  @media print { body { padding: 0; } }
</style></head>
<body>
  <h1>${title}</h1>
  <h2>Approval Issue / Receive Voucher</h2>
  <div class="voucher-no">${voucherNumber}</div>
  ${bodyHtml}
</body></html>`;

const metaBlock = (leftLabel, leftValue, rightLabel, rightValue) => `
  <div class="meta-row">
    <div class="meta-col"><b>${leftLabel}</b>${leftValue}</div>
    <div class="meta-col"><b>${rightLabel}</b>${rightValue}</div>
  </div>`;

const signatureBlock = () => `
  <div class="signatures">
    <div class="sig-box">Issued By / Shop Signature</div>
    <div class="sig-box">Received By / Party Signature</div>
  </div>`;

export const printTaggedIssueVoucher = (issue, items) => {
  const rows = items.map(i => `
    <tr>
      <td>${i.Article_Number}</td>
      <td>${i.Purity_Code || '—'}</td>
      <td>${formatWeight(i.Gross_Weight)}</td>
      <td>${formatCurrency(i.Approx_Value)}</td>
    </tr>`).join('');
  const totalWeight = items.reduce((s, i) => s + parseFloat(i.Gross_Weight || 0), 0);
  const totalValue = items.reduce((s, i) => s + parseFloat(i.Approx_Value || 0), 0);
  const body = `
    ${metaBlock('Party', `${issue.Party_Name || 'Walk-in / Unregistered'}${issue.Shop_Name ? ` — ${issue.Shop_Name}` : ''}${issue.Party_Mobile ? `<br/>${issue.Party_Mobile}` : ''}`,
      'Issue Date', `${fmtDate(issue.Issue_Date)}${issue.Expected_Return_Date ? `<br/>Expected Return: ${fmtDate(issue.Expected_Return_Date)}` : ''}`)}
    <table><thead><tr><th>Article No</th><th>Purity</th><th>Gross Wt</th><th>Value</th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr><td colspan="2">Total (${items.length} items)</td><td>${formatWeight(totalWeight)}</td><td>${formatCurrency(totalValue)}</td></tr></tfoot>
    </table>
    ${signatureBlock()}`;
  printHTML('other', voucherShell('Approval Issue', issue.Voucher_Number, body), { docType: 'Approval Issue', docNumber: issue.Voucher_Number });
};

export const printTaggedReceiveVoucher = (receive, issue, items) => {
  const rows = items.map(i => `
    <tr>
      <td>${i.Article_Number}</td>
      <td>${i.Purity_Code || '—'}</td>
      <td>${formatWeight(i.Gross_Weight)}</td>
      <td>${formatCurrency(i.Approx_Value)}</td>
    </tr>`).join('');
  const totalWeight = items.reduce((s, i) => s + parseFloat(i.Gross_Weight || 0), 0);
  const totalValue = items.reduce((s, i) => s + parseFloat(i.Approx_Value || 0), 0);
  const body = `
    ${metaBlock('Against Issue Voucher', issue?.Voucher_Number || '—', 'Receive Date', fmtDate(receive.Receive_Date))}
    <table><thead><tr><th>Article No</th><th>Purity</th><th>Gross Wt</th><th>Value</th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr><td colspan="2">Total (${items.length} items)</td><td>${formatWeight(totalWeight)}</td><td>${formatCurrency(totalValue)}</td></tr></tfoot>
    </table>
    ${signatureBlock()}`;
  printHTML('other', voucherShell('Approval Receive', receive.Voucher_Number, body), { docType: 'Approval Receive', docNumber: receive.Voucher_Number });
};

export const printNonTagIssueVoucher = (issue, items) => {
  const rows = items.map(i => `
    <tr>
      <td>${i.Item_Type}</td>
      <td>${i.Design_Type || '—'}</td>
      <td>${formatWeight(i.Gross_Weight)}</td>
      <td>${formatCurrency(i.Approx_Value)}</td>
    </tr>`).join('');
  const totalWeight = items.reduce((s, i) => s + parseFloat(i.Gross_Weight || 0), 0);
  const totalValue = items.reduce((s, i) => s + parseFloat(i.Approx_Value || 0), 0);
  const body = `
    ${metaBlock('Party', `${issue.Party_Name || 'Walk-in / Unregistered'}${issue.Shop_Name ? ` — ${issue.Shop_Name}` : ''}${issue.Party_Mobile ? `<br/>${issue.Party_Mobile}` : ''}`,
      'Issue Date', `${fmtDate(issue.Issue_Date)}${issue.Expected_Return_Date ? `<br/>Expected Return: ${fmtDate(issue.Expected_Return_Date)}` : ''}`)}
    <table><thead><tr><th>Item Type</th><th>Design</th><th>Gross Wt</th><th>Value</th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr><td colspan="2">Total (${items.length} items)</td><td>${formatWeight(totalWeight)}</td><td>${formatCurrency(totalValue)}</td></tr></tfoot>
    </table>
    ${signatureBlock()}`;
  printHTML('other', voucherShell('Non-Tagged Approval Issue', issue.Voucher_Number, body), { docType: 'Non-Tagged Approval Issue', docNumber: issue.Voucher_Number });
};

export const printNonTagReceiveVoucher = (receive, issue, items) => {
  const rows = items.map(i => `
    <tr>
      <td>${i.Item_Type}</td>
      <td>${i.Design_Type || '—'}</td>
      <td>${formatWeight(i.Gross_Weight)}</td>
      <td>${formatCurrency(i.Approx_Value)}</td>
    </tr>`).join('');
  const totalWeight = items.reduce((s, i) => s + parseFloat(i.Gross_Weight || 0), 0);
  const totalValue = items.reduce((s, i) => s + parseFloat(i.Approx_Value || 0), 0);
  const body = `
    ${metaBlock('Against Issue Voucher', issue?.Voucher_Number || '—', 'Receive Date', fmtDate(receive.Receive_Date))}
    <table><thead><tr><th>Item Type</th><th>Design</th><th>Gross Wt</th><th>Value</th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr><td colspan="2">Total (${items.length} items)</td><td>${formatWeight(totalWeight)}</td><td>${formatCurrency(totalValue)}</td></tr></tfoot>
    </table>
    ${signatureBlock()}`;
  printHTML('other', voucherShell('Non-Tagged Approval Receive', receive.Voucher_Number, body), { docType: 'Non-Tagged Approval Receive', docNumber: receive.Voucher_Number });
};
