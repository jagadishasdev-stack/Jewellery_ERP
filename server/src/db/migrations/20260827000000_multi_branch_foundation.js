/**
 * Multi-Branch Management Module — Phase 1 foundation.
 *
 * tbl_customer_master had NO Branch_ID at all (customers were purely
 * tenant-wide) — added nullable, matching the same nullable convention
 * every other Branch_ID column in this app already uses (a customer who
 * predates this feature, or who's genuinely shared across branches,
 * simply has no branch association rather than an invalid one).
 *
 * tbl_user_branch_access is the branch-access analog of the existing
 * tbl_user_permission_override / tbl_user_bin_access tables (see
 * routes/permissions.js) — an explicit grant table for narrowing a user's
 * branch access below "all branches this tenant has." All_Branch_Access
 * on tbl_user_master is the short-circuit for roles that should always
 * see everything (Super Admin already bypasses via roleName; this flag
 * covers a tenant's own Owner/Admin-equivalent users) without needing a
 * row per branch that will just grow every time a new branch is added.
 */
exports.up = async function (knex) {
  await knex.schema.alterTable('tbl_customer_master', (t) => {
    t.string('Branch_ID', 20).nullable().references('Branch_ID').inTable('tbl_branch_master').onDelete('SET NULL');
    t.index(['Tenant_ID', 'Branch_ID'], 'idx_customer_tenant_branch');
  });

  await knex.schema.alterTable('tbl_user_master', (t) => {
    t.boolean('All_Branch_Access').notNullable().defaultTo(false);
  });

  await knex.schema.createTable('tbl_user_branch_access', (t) => {
    t.increments('Access_ID').primary();
    t.integer('User_ID').notNullable().references('User_ID').inTable('tbl_user_master').onDelete('CASCADE');
    t.string('Tenant_ID', 20).notNullable().references('Tenant_ID').inTable('tbl_tenant_master').onDelete('CASCADE');
    t.string('Branch_ID', 20).notNullable().references('Branch_ID').inTable('tbl_branch_master').onDelete('CASCADE');
    t.string('Created_By', 100).nullable();
    t.timestamp('Created_Date', { useTz: true }).defaultTo(knex.fn.now());
    t.unique(['User_ID', 'Branch_ID'], 'uq_user_branch_access');
  });

  // Backfill: every EXISTING 'Client Admin' (the tenant's own owner/admin
  // role) keeps seeing every branch by default, same as today (there was
  // no branch restriction of any kind before this migration). This is a
  // starting default, not a hardcoded bypass — unlike Super Admin, a
  // Client Admin's All_Branch_Access can still be turned off per-user
  // later (e.g. a regional admin who should only see their own region).
  await knex('tbl_user_master')
    .whereIn('Role_ID', knex('tbl_role_master').select('Role_ID').where('Role_Name', 'Client Admin'))
    .update({ All_Branch_Access: true });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('tbl_user_branch_access');
  await knex.schema.alterTable('tbl_user_master', (t) => {
    t.dropColumn('All_Branch_Access');
  });
  await knex.schema.alterTable('tbl_customer_master', (t) => {
    t.dropIndex(['Tenant_ID', 'Branch_ID'], 'idx_customer_tenant_branch');
    t.dropColumn('Branch_ID');
  });
};
