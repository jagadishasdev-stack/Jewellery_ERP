/**
 * Journal_Number generation used to be "SELECT MAX(Journal_ID)'s number,
 * add 1, retry up to 5 times on a unique-constraint collision" — found,
 * via a real stress test, to lose data under realistic concurrency: 15
 * journals posted at once (not even an extreme number — 4 real sales
 * created moments apart, each firing its own unawaited accounting post,
 * reproduced this exact loss) dropped 6 of them, each rejecting with
 * "Could not allocate a unique journal number after 5 attempts" once every
 * retry also collided. Since the caller (Sales/Purchase/Savings/Vouchers)
 * never awaits this post, that failure was silently swallowed — a sale
 * would succeed for the customer while its accounting entry just
 * vanished, with only a console.error to show for it.
 *
 * This table makes journal numbering genuinely atomic: one UPSERT that
 * increments Last_Seq and returns the new value in a single statement,
 * which Postgres itself serializes — no read-then-write window for two
 * concurrent requests to land on the same number, at any concurrency level.
 */
exports.up = async function (knex) {
  await knex.schema.createTable('tbl_journal_number_counter', (t) => {
    t.string('Tenant_ID', 20).primary().references('Tenant_ID').inTable('tbl_tenant_master').onDelete('CASCADE');
    t.integer('Last_Seq').notNullable().defaultTo(0);
  });

  // Backfill every tenant's counter from its own existing max Journal_Number
  // sequence, so numbering continues from where it already was instead of
  // restarting at 1 (which would collide with real, existing journals).
  const rows = await knex('tbl_accounting_journal')
    .select('Tenant_ID')
    .max('Journal_Number as maxNum')
    .groupBy('Tenant_ID');
  for (const row of rows) {
    const seq = parseInt((row.maxNum || '0').split('-').pop(), 10) || 0;
    await knex('tbl_journal_number_counter').insert({ Tenant_ID: row.Tenant_ID, Last_Seq: seq })
      .onConflict('Tenant_ID').merge();
  }
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('tbl_journal_number_counter');
};
