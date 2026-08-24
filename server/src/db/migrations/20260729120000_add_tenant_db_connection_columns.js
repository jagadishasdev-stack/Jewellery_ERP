/**
 * Database-per-tenant migration, Phase 1: each tenant's own PostgreSQL
 * connection details live on its tbl_tenant_master row. A tenant with no
 * DB_Host set has not been migrated to its own database yet — the resolver
 * falls back to the shared control-plane connection for those (this is what
 * lets every existing tenant keep working unchanged until Phase 4 migrates
 * their data and populates these columns).
 */
exports.up = async function (knex) {
  await knex.schema.alterTable('tbl_tenant_master', (t) => {
    t.string('DB_Host', 255).nullable();
    t.integer('DB_Port').nullable();
    t.string('DB_Name', 100).nullable();
    t.string('DB_User', 100).nullable();
    t.string('DB_Password', 255).nullable();
    t.boolean('DB_SSL').defaultTo(false);
    t.timestamp('DB_Provisioned_At').nullable();
  });
};

exports.down = async function (knex) {
  await knex.schema.alterTable('tbl_tenant_master', (t) => {
    t.dropColumn('DB_Host');
    t.dropColumn('DB_Port');
    t.dropColumn('DB_Name');
    t.dropColumn('DB_User');
    t.dropColumn('DB_Password');
    t.dropColumn('DB_SSL');
    t.dropColumn('DB_Provisioned_At');
  });
};
