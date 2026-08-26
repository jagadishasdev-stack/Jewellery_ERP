/**
 * Metal_Type -> inventory ledger mapping — the single source of truth for
 * "which Chart of Accounts stock account does a given item's metal type
 * actually Dr (on purchase) or Cr (on sale, alongside a matching Dr to
 * Cost of Goods Sold)". Same reasoning as paymentLedgerMap.js: before this,
 * purchase.js hardcoded 'Gold Stock Account' for every purchase regardless
 * of Metal_Type, so silver/platinum/diamond stock all inflated the gold
 * ledger instead of their own account, and no sale ever credited any stock
 * account at all (Cost of Goods Sold was never posted anywhere).
 */
const STOCK_LEDGER = {
  Gold:     { account: 'Gold Stock Account',     group: 'Assets', sub: 'Inventory' },
  Silver:   { account: 'Silver Stock Account',   group: 'Assets', sub: 'Inventory' },
  Platinum: { account: 'Platinum Stock Account', group: 'Assets', sub: 'Inventory' },
  Diamond:  { account: 'Diamond Stock Account',  group: 'Assets', sub: 'Inventory' },
};

// Finished Jewellery Stock Account is the fallback for anything without a
// recognized Metal_Type (old free-text bin data, a metal type added later
// this map doesn't know about yet) — never silently mixed into Gold's own
// account just because gold is the most common case.
const FALLBACK_STOCK_LEDGER = { account: 'Finished Jewellery Stock Account', group: 'Assets', sub: 'Inventory' };

function resolveStockLedger(metalType) {
  return STOCK_LEDGER[metalType] || FALLBACK_STOCK_LEDGER;
}

module.exports = { STOCK_LEDGER, FALLBACK_STOCK_LEDGER, resolveStockLedger };
