/**
 * Sync_UUID retrofit — the offline-safe identity column.
 *
 * §33 of the multi-tenant local+cloud sync architecture doc is right that
 * AUTO_INCREMENT integer PKs are unsafe across independently-offline devices
 * (two shops' PCs, or even two PCs in the same shop, can both mint the same
 * next integer while disconnected). But ripping out and replacing every
 * integer PK across the 134 tables already built — and every FK pointing at
 * one — is a large, invasive, high-risk rewrite for very little practical
 * gain: within ONE tenant's own database, integer PKs from ONE device are
 * still perfectly safe; the actual collision risk is specifically about a
 * record's *cross-device sync identity*, not its local storage/joins.
 *
 * So instead: every table that can hold a shop's own operational data (i.e.
 * every table with a Tenant_ID column — that's the exact same "is this
 * tenant business data, not global reference data" boundary already used
 * throughout this schema) gets an additional Sync_UUID column:
 *   - generated locally, at row-creation time, by whichever device created
 *     the row (no round-trip to the server needed — that's the whole point)
 *   - globally unique regardless of which device or which tenant created it
 *   - used by the sync engine (tbl_sync_queue/tbl_sync_log, see the next
 *     migration) as the actual dedupe/idempotency key
 *   - the integer PK stays the PK; Sync_UUID is a parallel identity, not a
 *     replacement — every existing FK, join, and index keeps working exactly
 *     as it does today.
 *
 * Table list is discovered dynamically (every table with a Tenant_ID column)
 * rather than hand-enumerated, so this migration doesn't silently go stale
 * as new tenant-scoped tables get added later.
 */
exports.up = async function (knex) {
  const rows = await knex('information_schema.columns')
    .select('table_name')
    .where({ table_schema: 'public', column_name: 'Tenant_ID' })
    .orderBy('table_name');

  const tables = [...new Set(rows.map((r) => r.table_name))];

  for (const table of tables) {
    const hasCol = await knex.schema.hasColumn(table, 'Sync_UUID');
    if (hasCol) continue;
    // Two separate alterTable calls: the column needs its (volatile) default
    // to backfill every existing row with a distinct UUID before the unique
    // constraint is added on top of it.
    await knex.schema.alterTable(table, (t) => {
      t.uuid('Sync_UUID').notNullable().defaultTo(knex.raw('gen_random_uuid()'));
    });
    await knex.schema.alterTable(table, (t) => {
      t.unique(['Sync_UUID']);
    });
  }
};

exports.down = async function (knex) {
  const rows = await knex('information_schema.columns')
    .select('table_name')
    .where({ table_schema: 'public', column_name: 'Sync_UUID' })
    .orderBy('table_name');

  for (const { table_name } of rows) {
    await knex.schema.alterTable(table_name, (t) => {
      t.dropColumn('Sync_UUID');
    });
  }
};
