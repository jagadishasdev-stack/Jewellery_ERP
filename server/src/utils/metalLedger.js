/**
 * Metal Transaction ledger helper — appends a real running-balance entry.
 * Shared by the manual entry routes (metalTransactionLedger.js) and Pure
 * Gold Bin's create/dispose actions (binManagement.js), so both write
 * through the exact same balance-computation logic rather than two
 * hand-maintained copies that could drift.
 */
const db = require('../db/tenantDb').tenantDb;

/**
 * Appends a signed entry and returns the inserted row (with Balance_After
 * computed from the metal's current running balance). Pass an existing
 * knex transaction via `trx` to make this part of a larger atomic write
 * (e.g. Pure Gold Bin's own insert/dispose transaction); otherwise runs
 * in its own transaction.
 */
async function appendMetalLedgerEntry({
  trx, tenantId, branchId, metalType, transactionType, weightChange,
  purity, referenceType, referenceId, notes, createdBy,
}) {
  const run = async (t) => {
    // Locks the metal's most recent row for the duration of this
    // transaction so two concurrent entries for the same metal can't
    // read the same starting balance and both compute a wrong total.
    const last = await t('tbl_metal_transaction_ledger')
      .where({ Tenant_ID: tenantId, Metal_Type: metalType })
      .orderBy('Ledger_ID', 'desc')
      .forUpdate()
      .first();
    const openingBalance = last ? parseFloat(last.Balance_After) : 0;
    const balanceAfter = Math.round((openingBalance + parseFloat(weightChange)) * 1000) / 1000;
    const [row] = await t('tbl_metal_transaction_ledger').insert({
      Tenant_ID: tenantId, Branch_ID: branchId || null, Metal_Type: metalType,
      Transaction_Type: transactionType, Weight_Change: weightChange, Balance_After: balanceAfter,
      Purity: purity || null, Reference_Type: referenceType || null, Reference_ID: referenceId || null,
      Notes: notes || null, Created_By: createdBy,
    }).returning('*');
    return row;
  };
  return trx ? run(trx) : db.transaction(run);
}

module.exports = { appendMetalLedgerEntry };
