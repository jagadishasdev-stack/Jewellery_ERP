/**
 * Metal Rate — adds branch-level rates. Previously one row per
 * (Tenant_ID, Rate_Date) only — every branch shared the same rate.
 * Branch_ID is nullable and means "tenant-wide default rate" — fully
 * backward compatible; a tenant/branch that never sets its own rate
 * keeps reading/writing that same default row exactly as before.
 *
 * Two SEPARATE partial unique indexes, not one plain unique() across all
 * three columns — Postgres treats every NULL as distinct from every
 * other NULL for uniqueness purposes, so a plain
 * unique(Tenant_ID, Branch_ID, Rate_Date) would silently allow multiple
 * tenant-wide (Branch_ID IS NULL) rows for the same day, the exact bug
 * already caught once this session in Packet Stock's active-membership
 * index.
 */
exports.up = async function up(knex) {
  await knex.schema.alterTable('tbl_tenant_rates', (t) => {
    t.string('Branch_ID', 20).references('Branch_ID').inTable('tbl_branch_master').onDelete('CASCADE');
  });
  await knex.schema.alterTable('tbl_tenant_rates', (t) => {
    t.dropUnique(['Tenant_ID', 'Rate_Date'], 'uq_tenant_rate_date');
  });
  await knex.raw(`
    CREATE UNIQUE INDEX uq_tenant_rate_date_default ON tbl_tenant_rates ("Tenant_ID", "Rate_Date") WHERE "Branch_ID" IS NULL
  `);
  await knex.raw(`
    CREATE UNIQUE INDEX uq_tenant_rate_date_branch ON tbl_tenant_rates ("Tenant_ID", "Branch_ID", "Rate_Date") WHERE "Branch_ID" IS NOT NULL
  `);
};

exports.down = async function down(knex) {
  await knex.raw('DROP INDEX IF EXISTS uq_tenant_rate_date_default');
  await knex.raw('DROP INDEX IF EXISTS uq_tenant_rate_date_branch');
  await knex.schema.alterTable('tbl_tenant_rates', (t) => {
    t.unique(['Tenant_ID', 'Rate_Date'], 'uq_tenant_rate_date');
    t.dropColumn('Branch_ID');
  });
};
