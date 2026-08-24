/**
 * Tenant UI Theme — one row per tenant, controlling the ERP admin panel's
 * global look: font family/weight, primary accent color, and text case.
 * Set by an admin (tenant_management permission) and applied for every
 * user of that tenant — not a per-device/per-user preference.
 */
exports.up = async function (knex) {
  await knex.schema.createTable('tbl_tenant_ui_theme', (t) => {
    t.string('Tenant_ID', 20).primary().references('Tenant_ID').inTable('tbl_tenant_master').onDelete('CASCADE');
    t.string('Font_Family', 100).defaultTo('Inter');
    t.integer('Font_Weight').defaultTo(400); // 300-800, applied as the base body weight
    t.string('Primary_Color', 20).defaultTo('#B8860B');
    t.string('Text_Case', 20).defaultTo('none'); // 'none' | 'uppercase' | 'lowercase'
    t.string('Updated_By', 50);
    t.timestamp('Updated_Date').defaultTo(knex.fn.now());
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('tbl_tenant_ui_theme');
};
