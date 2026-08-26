/**
 * Multi-Branch Management — tbl_return_from_karigar and
 * tbl_old_gold_exchange had no Branch_ID at all (unlike almost every
 * other transaction table). Nullable, same convention as everywhere else.
 */
exports.up = async function (knex) {
  await knex.schema.alterTable('tbl_return_from_karigar', (t) => {
    t.string('Branch_ID', 20).nullable().references('Branch_ID').inTable('tbl_branch_master').onDelete('SET NULL');
    t.index(['Tenant_ID', 'Branch_ID'], 'idx_karigar_return_tenant_branch');
  });
  await knex.schema.alterTable('tbl_old_gold_exchange', (t) => {
    t.string('Branch_ID', 20).nullable().references('Branch_ID').inTable('tbl_branch_master').onDelete('SET NULL');
    t.index(['Tenant_ID', 'Branch_ID'], 'idx_oldgold_tenant_branch');
  });
};

exports.down = async function (knex) {
  await knex.schema.alterTable('tbl_old_gold_exchange', (t) => {
    t.dropIndex(['Tenant_ID', 'Branch_ID'], 'idx_oldgold_tenant_branch');
    t.dropColumn('Branch_ID');
  });
  await knex.schema.alterTable('tbl_return_from_karigar', (t) => {
    t.dropIndex(['Tenant_ID', 'Branch_ID'], 'idx_karigar_return_tenant_branch');
    t.dropColumn('Branch_ID');
  });
};
