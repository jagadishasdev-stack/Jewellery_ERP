/**
 * "Hide from Catalog" — deliberately independent of the existing
 * Is_Hidden / Data_Mode machinery (see 20260718202603_create_tray_hidden_stock.js
 * and utils/dataModeFilter.js). Is_Hidden is an owner's-reserve/audit-hold
 * flag that removes an item from POS, normal stock views and Official-mode
 * sales reports (Contains_Hidden_Stock on tbl_sales_header) — a real
 * separate accounting concern. Show_In_Catalog controls ONLY whether an
 * item appears in the customer-facing product catalog (routes/
 * productCatalog.js) — billing, inventory counts, and GST/sales reports
 * must never look at this column. Defaults true so every existing item
 * stays visible in the catalog exactly as before this migration.
 */
exports.up = async function (knex) {
  await knex.schema.alterTable('tbl_ornament_master', (t) => {
    t.boolean('Show_In_Catalog').notNullable().defaultTo(true);
    t.index(['Tenant_ID', 'Show_In_Catalog'], 'idx_ornament_tenant_catalog_visibility');
  });
};

exports.down = async function (knex) {
  await knex.schema.alterTable('tbl_ornament_master', (t) => {
    t.dropIndex(['Tenant_ID', 'Show_In_Catalog'], 'idx_ornament_tenant_catalog_visibility');
    t.dropColumn('Show_In_Catalog');
  });
};
