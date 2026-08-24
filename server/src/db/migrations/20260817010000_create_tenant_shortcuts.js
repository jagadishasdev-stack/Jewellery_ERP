/**
 * Per-tenant keyboard-shortcut overrides — one row per tenant, same
 * shape/pattern as tbl_tenant_ui_theme (no row = use system defaults;
 * Shortcuts only ever needs to hold the keys a tenant actually changed,
 * merged onto the defaults in utils/shortcuts.js at read time).
 */
exports.up = async function (knex) {
  await knex.schema.createTable('tbl_tenant_shortcuts', (t) => {
    t.string('Tenant_ID', 20).primary().references('Tenant_ID').inTable('tbl_tenant_master').onDelete('CASCADE');
    t.jsonb('Shortcuts').notNullable().defaultTo('{}');
    t.string('Updated_By', 50);
    t.timestamp('Updated_Date').defaultTo(knex.fn.now());
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('tbl_tenant_shortcuts');
};
