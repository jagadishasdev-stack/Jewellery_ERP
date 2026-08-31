/**
 * Data Migration Center — Purchase migrator. The first transactional
 * (not master-data) migrator: posts a REAL double-entry journal via the
 * same postJournal()/resolveLedgerForPayment()/resolveStockLedger()
 * utilities purchase.js's live create route uses — never a raw table
 * insert, or Trial Balance/P&L would silently disagree with the
 * transactional data forever (see the plan's own non-negotiable #6).
 *
 * Header-only: a "Purchase Register" export is normally one row per
 * invoice, not one row per line item, so there's no per-metal weight/
 * value breakdown to post — the accrual side goes to the generic
 * fallback stock ledger (resolveStockLedger's own fallback for exactly
 * this "unknown/unspecified metal" case) for the full Subtotal_Amount,
 * rather than guessing a Gold/Silver split that isn't in the source data.
 *
 * Migrated purchases land with Status='Received' directly — these are
 * settled historical facts, not new purchases awaiting the live
 * Draft->Approved->Received approval workflow.
 */
const { batchInsertWithIdMap, logSkipped, logError } = require('../migrationIdMap');
const { nextNumber } = require('../../../utils/numberFormat');
const { postJournal } = require('../../../utils/accountingEngine');
const { resolveLedgerForPayment } = require('../../../utils/paymentLedgerMap');
const { resolveStockLedger } = require('../../../utils/stockLedgerMap');

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

async function resolveVendorId(targetDb, tenantId, supplierName) {
  const clean = String(supplierName || '').trim();
  if (!clean) return null;
  const row = await targetDb('tbl_vendor_master').where('Tenant_ID', tenantId).whereRaw('LOWER("Vendor_Name") = LOWER(?)', [clean]).first();
  return row ? row.Vendor_ID : null;
}

async function migratePurchases(targetDb, tenantId, stagedRows, migrationId) {
  const toInsert = [];
  const meta = [];
  const postingQueue = []; // accounting entries posted AFTER the batch insert commits, same ordering purchase.js itself uses

  for (const row of stagedRows) {
    const mapped = row.Mapped_Data || {};
    if (row.Duplicate_Action === 'Skip') { await logSkipped(migrationId, 'purchase', row.Source_Row, 'Skipped per duplicate resolution.'); continue; }
    if (row.Import_Status === 'Imported') continue;
    if (row.Validation_Status === 'Error') { await logSkipped(migrationId, 'purchase', row.Source_Row, 'Skipped — failed validation.'); continue; }
    if (row.Duplicate_Action === 'UseExisting' && row.Duplicate_Match_Id) {
      meta.push({ oldId: row.Source_ID || row.Staging_ID, sourceRow: row.Source_Row, resolvedExisting: row.Duplicate_Match_Id });
      continue;
    }

    const vendorId = await resolveVendorId(targetDb, tenantId, mapped.Supplier_Name);
    const purchaseNumber = await nextNumber({ tenantId, table: 'tbl_purchase_header', column: 'Purchase_Number', prefix: 'PUR', tenantCode: tenantId.replace('_', ''), padWidth: 4 });
    const totalAmount = round2(parseFloat(mapped.Total_Amount || 0));
    const amountPaid = round2(Math.min(parseFloat(mapped.Amount_Paid || 0), totalAmount));
    const balance = round2(Math.max(0, totalAmount - amountPaid));
    const paymentStatus = balance <= 0.01 ? 'Paid' : amountPaid > 0 ? 'Partial' : 'Pending';

    toInsert.push({
      Tenant_ID: tenantId,
      Purchase_Number: purchaseNumber,
      Purchase_Date: mapped.Purchase_Date || new Date(),
      Supplier_ID: vendorId,
      Supplier_Name: mapped.Supplier_Name || null,
      Supplier_Invoice_No: mapped.Supplier_Invoice_No || null,
      Subtotal_Amount: totalAmount,
      Total_Amount: totalAmount,
      Amount_Paid: amountPaid,
      Balance_Amount: balance,
      Payment_Status: paymentStatus,
      Payment_Mode: mapped.Payment_Mode || null,
      Status: 'Received',
      Data_Mode: 3,
      Created_By: 'migration',
    });
    meta.push({ oldId: row.Source_ID || row.Staging_ID, sourceRow: row.Source_Row });
    postingQueue.push({ purchaseNumber, totalAmount, amountPaid, paymentMode: mapped.Payment_Mode || 'Cash' });
  }

  const idMap = await batchInsertWithIdMap(targetDb, 'tbl_purchase_header', 'Purchase_ID', toInsert, meta.filter((m) => !m.resolvedExisting), migrationId, 'purchase');
  for (const m of meta) if (m.resolvedExisting) idMap.set(String(m.oldId), m.resolvedExisting);

  // Accounting — posted AFTER the header rows are committed, matching
  // purchase.js's own ordering (a ledger hiccup never rolls back an
  // already-created purchase). sourceType/sourceId are the REAL
  // Purchase record, exactly like a live purchase — NOT tagged as a
  // generic "migration" source, so this migrated purchase's journal is
  // found by the exact same lookups ("show me this purchase's
  // accounting entries") a live one already uses. migration_id_mappings
  // (written above) is the join path for "which purchases did migration
  // X create", not the journal's own sourceType.
  // toInsert/meta/postingQueue were built in lock-step (one entry per
  // row that actually got queued for insert) — walking them together is
  // the simplest, unambiguous way to find each posting's real new ID.
  let insertedIdx = 0;
  for (let i = 0; i < meta.length; i++) {
    if (meta[i].resolvedExisting) continue;
    const newId = idMap.get(String(meta[i].oldId));
    const posting = postingQueue[insertedIdx++];
    if (!newId || !posting) continue;
    try {
      const stockLedger = resolveStockLedger('Unknown'); // no per-metal breakdown at header-only granularity — see file header
      const lines = [{ account: stockLedger.account, group: stockLedger.group, sub: stockLedger.sub, type: 'Dr', amount: posting.totalAmount, narration: `Purchase | ${posting.purchaseNumber}` }];
      lines.push({ account: 'Supplier Payable Account', group: 'Liabilities', sub: 'Payable', type: 'Cr', amount: posting.totalAmount, narration: `Purchase | ${posting.purchaseNumber}` });
      await postJournal({ tenantId, sourceType: 'PURCHASE', sourceId: newId, reference: posting.purchaseNumber, narration: `Migrated purchase ${posting.purchaseNumber}`, lines, createdBy: 'migration', dataMode: 3 });

      if (posting.amountPaid > 0) {
        const ledger = await resolveLedgerForPayment(targetDb, tenantId, posting.paymentMode);
        await postJournal({
          tenantId, sourceType: 'PAYMENT', sourceId: newId, reference: posting.purchaseNumber, narration: `Payment against ${posting.purchaseNumber}`,
          lines: [
            { account: 'Supplier Payable Account', group: 'Liabilities', sub: 'Payable', type: 'Dr', amount: posting.amountPaid, narration: `Paid against ${posting.purchaseNumber}` },
            { account: ledger.account, group: ledger.group, sub: ledger.sub, type: 'Cr', amount: posting.amountPaid, narration: `Paid against ${posting.purchaseNumber}` },
          ],
          createdBy: 'migration', dataMode: 3,
        });
      }
    } catch (err) {
      await logError(migrationId, 'purchase', null, `Purchase #${newId} (${posting.purchaseNumber}) created, but posting its accounting entry failed: ${err.message}`);
    }
  }

  return idMap;
}

module.exports = { migratePurchases, resolveVendorId };
