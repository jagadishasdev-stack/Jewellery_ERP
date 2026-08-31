/**
 * Data Migration Center — Sale migrator. Header-only, same reasoning as
 * purchaseMigrator.js — a "Sales Register" export is one row per invoice.
 * Because there's no item-level linkage to a specific migrated Ornament,
 * no Cost of Goods Sold entry is posted here (there's no reliable
 * Purchase_Cost to pair it against) and no ornament is marked Is_Sold —
 * a real, honest scope limit, not a guess.
 *
 * Invoice Number Preservation (design doc §55): if the source data gives
 * a real Invoice_Number, it's kept as-is rather than overwritten by a
 * fresh auto-generated one — duplicate detection already ran earlier in
 * the pipeline, so a row that reaches this migrator with a given
 * Invoice_Number is known not to collide with an existing one.
 *
 * A migrated Sale marked returned (Is_Returned) is inserted directly
 * with Payment_Status='Cancelled' + Returned_Date already set — since
 * this migrator never marks any ornament sold in the first place (no
 * item-level linkage), there's no fake sell-then-unsell cycle to avoid.
 */
const { batchInsertWithIdMap, logSkipped, logError } = require('../migrationIdMap');
const { generateInvoiceNumber } = require('../../../utils/invoiceNumber');
const { postJournal } = require('../../../utils/accountingEngine');
const { resolveLedgerForPayment } = require('../../../utils/paymentLedgerMap');

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

async function resolveCustomerId(targetDb, tenantId, customerName) {
  const clean = String(customerName || '').trim();
  if (!clean) return null;
  const row = await targetDb('tbl_customer_master').where('Tenant_ID', tenantId).whereRaw('LOWER("Customer_Name") = LOWER(?)', [clean]).first();
  return row ? row.Customer_ID : null;
}

async function migrateSales(targetDb, tenantId, stagedRows, migrationId) {
  const toInsert = [];
  const meta = [];
  const postingQueue = [];

  for (const row of stagedRows) {
    const mapped = row.Mapped_Data || {};
    if (row.Duplicate_Action === 'Skip') { await logSkipped(migrationId, 'sale', row.Source_Row, 'Skipped per duplicate resolution.'); continue; }
    if (row.Import_Status === 'Imported') continue;
    if (row.Validation_Status === 'Error') { await logSkipped(migrationId, 'sale', row.Source_Row, 'Skipped — failed validation.'); continue; }
    if (row.Duplicate_Action === 'UseExisting' && row.Duplicate_Match_Id) {
      meta.push({ oldId: row.Source_ID || row.Staging_ID, sourceRow: row.Source_Row, resolvedExisting: row.Duplicate_Match_Id });
      continue;
    }

    const customerId = await resolveCustomerId(targetDb, tenantId, mapped.Customer_Name);
    const invoiceNumber = mapped.Invoice_Number || await generateInvoiceNumber(tenantId);
    const netPayable = round2(parseFloat(mapped.Net_Payable_Amount || 0));
    const isReturned = mapped.Is_Returned === true || mapped.Is_Returned === 'true';
    const amountPaid = isReturned ? 0 : round2(Math.min(parseFloat(mapped.Amount_Paid || 0), netPayable));
    const balance = isReturned ? 0 : round2(Math.max(0, netPayable - amountPaid));
    const paymentStatus = isReturned ? 'Cancelled' : balance <= 0.01 ? 'Paid' : amountPaid > 0 ? 'Partial' : 'Pending';

    toInsert.push({
      Tenant_ID: tenantId,
      Invoice_Number: invoiceNumber,
      Sale_Date: mapped.Sale_Date || new Date(),
      Customer_ID: customerId,
      Customer_Name: mapped.Customer_Name || null,
      Subtotal_Amount: netPayable,
      Net_Payable_Amount: netPayable,
      Amount_Paid: amountPaid,
      Balance_Amount: balance,
      Payment_Status: paymentStatus,
      Payment_Mode: mapped.Payment_Mode || null,
      Returned_Date: isReturned ? new Date() : null, // the exact historical return date isn't in the source data — this records when the migration processed it, not fabricated
      Data_Mode: 3,
      Created_By: 'migration',
    });
    meta.push({ oldId: row.Source_ID || row.Staging_ID, sourceRow: row.Source_Row });
    // A returned/cancelled sale never had real money change hands worth
    // posting — no journal for it, matching how a live /cancel never
    // posts one either.
    postingQueue.push(isReturned ? null : { invoiceNumber, netPayable, amountPaid, paymentMode: mapped.Payment_Mode || 'Cash' });
  }

  const idMap = await batchInsertWithIdMap(targetDb, 'tbl_sales_header', 'Sale_ID', toInsert, meta.filter((m) => !m.resolvedExisting), migrationId, 'sale');
  for (const m of meta) if (m.resolvedExisting) idMap.set(String(m.oldId), m.resolvedExisting);

  let insertedIdx = 0;
  for (let i = 0; i < meta.length; i++) {
    if (meta[i].resolvedExisting) continue;
    const newId = idMap.get(String(meta[i].oldId));
    const posting = postingQueue[insertedIdx++];
    if (!newId || !posting) continue; // null posting = a returned sale, deliberately not journaled
    try {
      const lines = [];
      if (posting.amountPaid > 0) {
        const ledger = await resolveLedgerForPayment(targetDb, tenantId, posting.paymentMode);
        lines.push({ account: ledger.account, group: ledger.group, sub: ledger.sub, type: 'Dr', amount: posting.amountPaid, narration: `Sale | ${posting.invoiceNumber}` });
      }
      const balanceDue = round2(posting.netPayable - posting.amountPaid);
      if (balanceDue > 0) lines.push({ account: 'Customer Receivable Account', group: 'Assets', sub: 'Receivable', type: 'Dr', amount: balanceDue, narration: `Sale | ${posting.invoiceNumber}` });
      lines.push({ account: 'Sales Account', group: 'Income', sub: 'Direct Income', type: 'Cr', amount: posting.netPayable, narration: `Sale | ${posting.invoiceNumber}` });

      await postJournal({ tenantId, sourceType: 'SALE', sourceId: newId, reference: posting.invoiceNumber, narration: `Migrated sale ${posting.invoiceNumber}`, lines, createdBy: 'migration', dataMode: 3 });
    } catch (err) {
      await logError(migrationId, 'sale', null, `Sale #${newId} (${posting.invoiceNumber}) created, but posting its accounting entry failed: ${err.message}`);
    }
  }

  return idMap;
}

module.exports = { migrateSales, resolveCustomerId };
