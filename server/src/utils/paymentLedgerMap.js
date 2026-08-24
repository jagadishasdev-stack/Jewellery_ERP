/**
 * Payment mode → Chart of Accounts ledger mapping — the single source of
 * truth for "what account does a Cash / UPI / NEFT / Cheque / ... payment
 * actually Dr or Cr". Previously sales.js and purchase.js each hand-rolled
 * their own copy of this (sales.js's had 16 modes, purchase.js's had only
 * 2 and fell back to the generic bank ledger for everything else) — a real
 * drift risk since a mode added to one would silently miss the other.
 * Now there's exactly one map both import.
 */
const PAYMENT_LEDGER = {
  'Cash':          { account: 'Cash Account',                                              group: 'Assets',      sub: 'Cash' },
  'UPI':           { account: 'UPI Clearing Account',                                      group: 'Assets',      sub: 'Bank' },
  'Debit Card':    { account: 'Bank Account (Unassigned — pre-dates per-bank ledgers)',     group: 'Assets',      sub: 'Bank' },
  'Credit Card':   { account: 'Credit Card Settlement Account',                            group: 'Assets',      sub: 'Bank' },
  'NEFT':          { account: 'Bank Account (Unassigned — pre-dates per-bank ledgers)',     group: 'Assets',      sub: 'Bank' },
  'RTGS':          { account: 'Bank Account (Unassigned — pre-dates per-bank ledgers)',     group: 'Assets',      sub: 'Bank' },
  'IMPS':          { account: 'Bank Account (Unassigned — pre-dates per-bank ledgers)',     group: 'Assets',      sub: 'Bank' },
  'Bank Transfer': { account: 'Bank Account (Unassigned — pre-dates per-bank ledgers)',     group: 'Assets',      sub: 'Bank' },
  'Cheque':        { account: 'Cheque In Hand Account',                                    group: 'Assets',      sub: 'Bank' },
  'Gift Voucher':  { account: 'Gift Voucher Account',                                      group: 'Liabilities', sub: 'Advance' },
  'Scheme':        { account: 'Customer Scheme Deposit Account',                           group: 'Liabilities', sub: 'Advance' },
  'Advance':       { account: 'Customer Advance Account',                                  group: 'Liabilities', sub: 'Advance' },
  // Synthetic "payment" rows for the Savings Scheme Adjustment Module — these
  // never appear in tbl_sales_payments, they're appended to the ledger-posting
  // array at the call site so the existing Dr-loop below picks them up for
  // free, without needing separate ledger code for each adjustment type.
  'Old Gold Exchange':   { account: 'Old Gold Stock Account',            group: 'Assets',      sub: 'Inventory' },
  'Scheme Adjustment':   { account: 'Customer Scheme Deposit Account',   group: 'Liabilities', sub: 'Advance' },
  'Bonus Adjustment':    { account: 'Scheme Bonus Provision Account',    group: 'Liabilities', sub: 'Provision' },
  'Customer Receivable': { account: 'Customer Receivable Account',       group: 'Assets',      sub: 'Receivable' },
};

const FALLBACK_BANK_LEDGER = { account: 'Bank Account (Unassigned — pre-dates per-bank ledgers)', group: 'Assets', sub: 'Bank' };

/**
 * Resolves a payment mode to its ledger, upgrading to a SPECIFIC bank's own
 * ledger when a real Bank_Account_ID is given (see accountingEngine.js's
 * bank-balance sync, and bankCheque.js which creates that per-bank ledger
 * the moment a bank account is added). Falls back to the shared
 * "Unassigned" bank ledger for any mode this map doesn't recognize.
 */
async function resolveLedgerForPayment(db, tenantId, mode, bankAccountId) {
  let ledger = PAYMENT_LEDGER[mode] || FALLBACK_BANK_LEDGER;
  if (bankAccountId) {
    const bankRow = await db('tbl_chart_of_accounts').where({ Tenant_ID: tenantId, Bank_Account_ID: bankAccountId, Is_Bank_Account: true }).first();
    if (bankRow) ledger = { account: bankRow.Account_Name, group: bankRow.Account_Group, sub: bankRow.Account_Sub_Group };
  }
  return ledger;
}

module.exports = { PAYMENT_LEDGER, FALLBACK_BANK_LEDGER, resolveLedgerForPayment };
