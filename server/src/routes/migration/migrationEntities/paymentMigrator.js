/**
 * Data Migration Center — standalone Payment migrator, for a source
 * "Receipt Register" separate from the Sales/Purchase register itself
 * (a customer who paid in several installments against one invoice, for
 * example). Resolves Against_Number to a real Sale (by Invoice_Number)
 * or Purchase (by Purchase_Number/Supplier_Invoice_No) — checking BOTH
 * already-migrated rows and pre-existing tenant data — and applies the
 * payment through the same real accounting path the live receive-
 * payment/pay-supplier routes use. A payment that can't be matched to
 * any real document is skipped with a clear reason, never silently
 * applied to the wrong invoice or dropped.
 */
const { logSkipped, logError } = require('../migrationIdMap');
const { postJournal } = require('../../../utils/accountingEngine');
const { resolveLedgerForPayment } = require('../../../utils/paymentLedgerMap');

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

async function findSaleByInvoice(targetDb, tenantId, invoiceNumber) {
  if (!invoiceNumber) return null;
  return targetDb('tbl_sales_header').where({ Tenant_ID: tenantId, Invoice_Number: invoiceNumber }).first();
}

async function findPurchaseByNumber(targetDb, tenantId, number) {
  if (!number) return null;
  return targetDb('tbl_purchase_header').where('Tenant_ID', tenantId)
    .where((b) => b.where('Purchase_Number', number).orWhere('Supplier_Invoice_No', number)).first();
}

async function applyToSale(targetDb, tenantId, sale, amount, mode, reference, migrationId, sourceRow) {
  const newPaid = round2(parseFloat(sale.Amount_Paid || 0) + amount);
  const balance = round2(Math.max(0, parseFloat(sale.Net_Payable_Amount) - newPaid));
  const status = balance <= 0.01 ? 'Paid' : 'Partial';
  await targetDb('tbl_sales_payments').insert({ Sale_ID: sale.Sale_ID, Tenant_ID: tenantId, Payment_Mode: mode, Amount: amount, Reference: reference || null, Data_Mode: 3, Created_By: 'migration' });
  await targetDb('tbl_sales_header').where('Sale_ID', sale.Sale_ID).update({ Amount_Paid: newPaid, Balance_Amount: balance, Payment_Status: status });
  try {
    const ledger = await resolveLedgerForPayment(targetDb, tenantId, mode);
    await postJournal({
      tenantId, sourceType: 'PAYMENT', sourceId: sale.Sale_ID, reference: sale.Invoice_Number, narration: `Migrated payment against ${sale.Invoice_Number}`,
      lines: [
        { account: ledger.account, group: ledger.group, sub: ledger.sub, type: 'Dr', amount, narration: `Received against ${sale.Invoice_Number}` },
        { account: 'Customer Receivable Account', group: 'Assets', sub: 'Receivable', type: 'Cr', amount, narration: `Received against ${sale.Invoice_Number}` },
      ],
      createdBy: 'migration', dataMode: 3,
    });
  } catch (err) { await logError(migrationId, 'payment', sourceRow, `Payment applied to Sale ${sale.Invoice_Number}, but posting its accounting entry failed: ${err.message}`); }
}

async function applyToPurchase(targetDb, tenantId, purchase, amount, mode, migrationId, sourceRow) {
  const newPaid = round2(parseFloat(purchase.Amount_Paid || 0) + amount);
  const balance = round2(Math.max(0, parseFloat(purchase.Total_Amount) - newPaid));
  const status = balance <= 0.01 ? 'Paid' : 'Partial';
  await targetDb('tbl_purchase_header').where('Purchase_ID', purchase.Purchase_ID).update({ Amount_Paid: newPaid, Balance_Amount: balance, Payment_Status: status });
  try {
    const ledger = await resolveLedgerForPayment(targetDb, tenantId, mode);
    await postJournal({
      tenantId, sourceType: 'PAYMENT', sourceId: purchase.Purchase_ID, reference: purchase.Purchase_Number, narration: `Migrated payment against ${purchase.Purchase_Number}`,
      lines: [
        { account: 'Supplier Payable Account', group: 'Liabilities', sub: 'Payable', type: 'Dr', amount, narration: `Paid against ${purchase.Purchase_Number}` },
        { account: ledger.account, group: ledger.group, sub: ledger.sub, type: 'Cr', amount, narration: `Paid against ${purchase.Purchase_Number}` },
      ],
      createdBy: 'migration', dataMode: 3,
    });
  } catch (err) { await logError(migrationId, 'payment', sourceRow, `Payment applied to Purchase ${purchase.Purchase_Number}, but posting its accounting entry failed: ${err.message}`); }
}

async function migratePayments(targetDb, tenantId, stagedRows, migrationId) {
  let applied = 0;
  for (const row of stagedRows) {
    const mapped = row.Mapped_Data || {};
    if (row.Import_Status === 'Imported') continue;
    if (row.Validation_Status === 'Error') { await logSkipped(migrationId, 'payment', row.Source_Row, 'Skipped — failed validation.'); continue; }
    if (row.Duplicate_Action === 'Skip') { await logSkipped(migrationId, 'payment', row.Source_Row, 'Skipped per duplicate resolution.'); continue; }

    const amount = round2(parseFloat(mapped.Amount || 0));
    if (amount <= 0) { await logSkipped(migrationId, 'payment', row.Source_Row, 'Skipped — zero or missing amount.'); continue; }
    const mode = mapped.Payment_Mode || 'Cash';

    const sale = await findSaleByInvoice(targetDb, tenantId, mapped.Against_Number);
    if (sale) { await applyToSale(targetDb, tenantId, sale, amount, mode, mapped.Payment_Reference, migrationId, row.Source_Row); applied++; continue; }

    const purchase = await findPurchaseByNumber(targetDb, tenantId, mapped.Against_Number);
    if (purchase) { await applyToPurchase(targetDb, tenantId, purchase, amount, mode, migrationId, row.Source_Row); applied++; continue; }

    await logSkipped(migrationId, 'payment', row.Source_Row, `Could not match "${mapped.Against_Number || '(none given)'}" to any migrated or existing Sale/Purchase — payment not applied.`);
  }
  return applied;
}

module.exports = { migratePayments };
