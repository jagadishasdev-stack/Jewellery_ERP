/**
 * Special Stock Isolation & Dual Screen Inventory Management.
 *
 * Stock_Classification is a pure OPERATIONAL/DISPLAY tag — which screen an
 * item shows up on by default (the normal showroom screen vs. the
 * admin-only Special Stock screen for in-house-karigar/reserved/special-
 * collection items). It is deliberately independent of, and NEVER wired
 * into:
 *   - Is_Hidden / Data_Mode / Contains_Hidden_Stock (the pre-existing
 *     Official/Unofficial accounting-mode machinery — a genuinely
 *     different, unrelated feature)
 *   - Show_In_Catalog (the customer-facing catalog-visibility flag)
 *   - Billing (routes/sales.js) — a Special Stock item bills through the
 *     exact same POST /api/sales/create, same invoice numbering, same
 *     GST/accounting, same reports as any other item.
 *
 * One source of truth: one inventory ledger, one barcode, one accounting
 * system. Special_Stock_Type is an optional free-text sub-label (e.g.
 * "In-house Karigar", "Special Collection") for when Stock_Classification
 * = 'Special' — not a separate lookup table, since the owner should be
 * able to type any label without an admin-screen detour, and there's no
 * requirement anywhere in the spec for these labels to be constrained to
 * a fixed list.
 */
exports.up = async function (knex) {
  await knex.schema.alterTable('tbl_ornament_master', (t) => {
    t.string('Stock_Classification', 20).notNullable().defaultTo('Normal');
    t.string('Special_Stock_Type', 50).nullable();
    t.index(['Tenant_ID', 'Stock_Classification'], 'idx_ornament_tenant_stock_classification');
  });
};

exports.down = async function (knex) {
  await knex.schema.alterTable('tbl_ornament_master', (t) => {
    t.dropIndex(['Tenant_ID', 'Stock_Classification'], 'idx_ornament_tenant_stock_classification');
    t.dropColumn('Special_Stock_Type');
    t.dropColumn('Stock_Classification');
  });
};
