/**
 * dataModeFilter — helper to inject Data_Mode into knex queries
 *
 * Usage in route handlers:
 *   const { withMode, modeVal } = dataModeFilter(req);
 *
 *   // Apply to any knex query builder:
 *   let qb = db('tbl_ornament_master').where('Tenant_ID', tenantId);
 *   withMode(qb);   // adds .where('Data_Mode', req.dataMode)
 *
 *   // Or inline:
 *   db('tbl_sales_header').where({ Tenant_ID: tid, Data_Mode: modeVal(req) })
 *
 * Tables that support Data_Mode (transaction tables only):
 *   tbl_ornament_master, tbl_sales_header, tbl_sales_payments,
 *   tbl_purchase_header, tbl_issue_to_karigar, tbl_scheme_members,
 *   tbl_scheme_transactions, tbl_scheme_groups, tbl_customer_master,
 *   tbl_accounting_journal, tbl_accounting_entries, tbl_stock_transfer
 *
 * Master tables (item types, gemstones, karigar master, etc.) do NOT have
 * Data_Mode and should NOT use this filter.
 */

/**
 * Returns the current data mode from the request (1, 2, or 3).
 * Defaults to 3 (official) if not set.
 */
const modeVal = (req) => req?.dataMode || 3;

/**
 * Applies Data_Mode filter to a knex query builder in-place.
 * Returns the same query builder for chaining.
 */
const withMode = (qb, req) => {
  return qb.where('Data_Mode', modeVal(req));
};

/**
 * Returns a plain object fragment to spread into .where({}) calls.
 * Example: db('tbl_sales_header').where({ Tenant_ID: tid, ...modeFilter(req) })
 */
const modeFilter = (req) => ({ Data_Mode: modeVal(req) });

/**
 * Ornament/stock visibility — deliberately NOT the same disjoint rule as
 * modeVal/withMode above. Official mode sees only its own non-hidden stock;
 * Unofficial mode sees the COMPLETE inventory (Official + Unofficial +
 * Hidden), since hiding a item only restricts the Official view, never the
 * Unofficial one. Practice mode stays fully sandboxed, untouched by hidden
 * stock. Only use this for internal, staff-facing stock reads (ornament
 * listings/reports) — never for transactional tables (sales, purchases,
 * transfers, etc.), which must keep using modeVal/withMode/modeFilter above.
 */
// `opts.includeHidden` — for the one legitimate exception to "Official mode
// never sees hidden stock": billing itself. The whole point of Special/
// Hidden stock (Stock_Classification) is that it's still real, sellable
// inventory — it can be billed from either screen and is included in GST
// — only kept OUT of casual browsing/listing and Official reports. A
// barcode/search lookup used to add an item to a bill must still find it;
// callers that are genuinely just browsing/listing stock (Stock
// Management, reports) omit this and get the original hide-it behavior.
// Is_On_Approval is never overridden by this flag — an item currently out
// with a customer isn't "hidden," it's physically not in the shop to sell.
const applyStockVisibility = (qb, req, alias = '', opts = {}) => {
  const p = alias ? `${alias}.` : '';
  const mode = modeVal(req);
  if (mode === 2) return qb.whereIn(`${p}Data_Mode`, [2, 3]);
  if (mode === 1) {
    qb = qb.where(`${p}Data_Mode`, 1).where(`${p}Is_On_Approval`, false);
    return opts.includeHidden ? qb : qb.where(`${p}Is_Hidden`, false);
  }
  qb = qb.where(`${p}Data_Mode`, 3).where(`${p}Is_On_Approval`, false);
  return opts.includeHidden ? qb : qb.where(`${p}Is_Hidden`, false);
};

/**
 * Sales-report visibility for tbl_sales_header/tbl_sales_details rows.
 * A hidden-stock sale (Contains_Hidden_Stock=true) can now be billed from
 * EITHER screen (see sales.js), so its own Data_Mode is no longer a
 * reliable signal for keeping it out of Official reporting — this is the
 * authoritative exclusion, independent of Data_Mode:
 *   - Official mode (3): excludes it. The "800 stock" screen's reports
 *     must never reflect hidden-stock revenue, matching the whole point of
 *     hiding it in the first place.
 *   - Unofficial mode (2): no-op — it shows everything, hidden-stock sales
 *     included, exactly like applyStockVisibility does for inventory.
 *   - Practice mode (1): no-op — hidden stock can never reach a dm=1 sale
 *     anyway (applyStockVisibility never surfaces it there to be booked).
 * Apply this to every sales-report query alongside the existing
 * Data_Mode=dm filter; `alias` is the same table alias already used for
 * tbl_sales_header in that query (omit when it's unaliased).
 */
const excludeHiddenStockSales = (qb, req, alias = '') => {
  const p = alias ? `${alias}.` : '';
  if (modeVal(req) === 3) return qb.where(`${p}Contains_Hidden_Stock`, false);
  return qb;
};

module.exports = { modeVal, withMode, modeFilter, applyStockVisibility, excludeHiddenStockSales };
