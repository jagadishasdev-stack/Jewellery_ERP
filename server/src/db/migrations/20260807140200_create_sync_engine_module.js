/**
 * Sync engine: tbl_sync_queue (outbound working queue) + tbl_sync_log
 * (permanent history, feeds the §82-style sync monitoring dashboard).
 *
 * Unlike the SA_MASTER governance tables in the previous migration, these
 * two are ordinary Tenant_ID-scoped tables — they exist in EVERY tenant's
 * own database (both the Postgres cloud copy and the MySQL local copy),
 * because sync is bidirectional: a local MySQL install queues its own
 * offline-created rows to push up, and a tenant's cloud database queues
 * changes (e.g. a price update from the web app) to push down to specific
 * devices. Same shape, same table, whichever side is currently the
 * origin of the change.
 *
 * Device_ID is NOT a foreign key to tbl_device_master — that table lives in
 * the SA_MASTER control-plane database, a different database (and for the
 * local MySQL copy, a different *engine*) than this one, so it can't be
 * referenced with a real constraint. It's carried as a plain indexed string
 * and validated at the application layer instead.
 *
 * Record_Sync_UUID (not Record_ID) is the actual cross-device dedupe key —
 * it's the same Sync_UUID value written onto the row itself by the
 * previous migration, so two devices independently queuing what turns out
 * to be the same eventual row can still be recognized as one record after
 * the fact, which a same-table integer Record_ID alone could not do.
 */
exports.up = async function (knex) {
  await knex.schema.createTable('tbl_sync_queue', (t) => {
    t.bigIncrements('Queue_ID').primary();
    t.string('Tenant_ID', 20).notNullable().references('Tenant_ID').inTable('tbl_tenant_master').onDelete('CASCADE');
    t.string('Branch_ID', 20).references('Branch_ID').inTable('tbl_branch_master').onDelete('SET NULL');
    t.string('Device_ID', 50).notNullable();
    t.string('Table_Name', 60).notNullable();
    t.bigInteger('Record_ID').notNullable();
    t.uuid('Record_Sync_UUID').notNullable();
    t.string('Operation', 10).notNullable(); // INSERT | UPDATE | DELETE
    t.jsonb('Payload'); // full row snapshot at queue time
    t.string('Status', 20).notNullable().defaultTo('Pending'); // Pending | Processing | Synced | Failed | Conflict
    t.integer('Retry_Count').defaultTo(0);
    t.text('Error_Message');
    t.timestamp('Created_Date').defaultTo(knex.fn.now());
    t.timestamp('Synced_Date');
    t.index(['Tenant_ID', 'Status'], 'idx_sync_queue_status');
    t.index(['Table_Name', 'Record_ID'], 'idx_sync_queue_record');
    t.index(['Record_Sync_UUID'], 'idx_sync_queue_sync_uuid');
    t.index(['Device_ID'], 'idx_sync_queue_device');
  });

  await knex.schema.createTable('tbl_sync_log', (t) => {
    t.bigIncrements('Log_ID').primary();
    t.string('Tenant_ID', 20).notNullable().references('Tenant_ID').inTable('tbl_tenant_master').onDelete('CASCADE');
    t.string('Device_ID', 50);
    t.string('Table_Name', 60).notNullable();
    t.uuid('Record_Sync_UUID');
    t.string('Direction', 20).notNullable(); // LOCAL_TO_CLOUD | CLOUD_TO_LOCAL
    t.string('Status', 20).notNullable(); // SUCCESS | FAILED | CONFLICT
    t.string('Conflict_Resolution', 20); // SERVER_WINS | CLIENT_WINS | MANUAL — set only when Status = CONFLICT
    t.text('Error_Message');
    t.timestamp('Synced_Date').defaultTo(knex.fn.now());
    t.index(['Tenant_ID', 'Status'], 'idx_sync_log_status');
    t.index(['Record_Sync_UUID'], 'idx_sync_log_sync_uuid');
  });

  const existingModule = await knex('tbl_erp_modules').where('Module_Key', 'sync_engine').first();
  if (!existingModule) {
    await knex('tbl_erp_modules').insert({
      Module_Key: 'sync_engine',
      Module_Name: 'Local ↔ Cloud Sync',
      Module_Group: 'Platform',
      Sort_Order: 42,
      Is_Core: true,
      Default_Retailer: true,
      Default_Wholesaler: true,
      Default_Manufacturer: true,
      Default_Hybrid: true,
    });
  }
};

exports.down = async function (knex) {
  await knex('tbl_erp_modules').where('Module_Key', 'sync_engine').del();
  await knex.schema.dropTableIfExists('tbl_sync_log');
  await knex.schema.dropTableIfExists('tbl_sync_queue');
};
