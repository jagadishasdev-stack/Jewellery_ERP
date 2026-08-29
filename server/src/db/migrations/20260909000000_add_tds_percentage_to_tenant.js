/**
 * TDS% — stored as a setting only (Company Settings page), no automatic
 * deduction/calculation logic wired to it anywhere. A deliberately small
 * first step: getting real tax-deduction math wrong has real compliance
 * consequences, so this is just a number the tenant can record and see,
 * not something the app acts on yet.
 */
exports.up = async function (knex) {
  await knex.schema.alterTable('tbl_tenant_master', (t) => {
    t.decimal('TDS_Percentage', 5, 2).defaultTo(0);
  });
};

exports.down = async function (knex) {
  await knex.schema.alterTable('tbl_tenant_master', (t) => {
    t.dropColumn('TDS_Percentage');
  });
};
