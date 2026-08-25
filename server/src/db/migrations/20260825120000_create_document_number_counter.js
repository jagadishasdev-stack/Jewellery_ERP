/**
 * Every document-number generator that goes through utils/numberFormat.js's
 * nextNumber() — Article_Number, Transfer_Number, Scheme/Old-Gold
 * Adjustment numbers, Approval Issue/Receive numbers, Non-Tag Issue/Receive
 * numbers, pawn Loan_Number/Receipt_Number, repair Job_Card_Number, and
 * more — used the exact same read-then-write pattern already found and
 * fixed once for Journal_Number (see 20260812000000_create_journal_number_
 * counter.js's own comment for the concrete stress-test failure): SELECT
 * the current max matching number, compute +1 in application code, INSERT.
 * Two concurrent requests can read the same max and compute the same next
 * number — at best a unique-constraint 500 on the loser, at worst (a
 * column with no unique constraint) a silently duplicated document number.
 *
 * This table generalizes that same atomic-UPSERT fix to every OTHER
 * document sequence at once. Sequence_Key is the exact pattern string
 * nextNumber() already computes (prefix + tenant code + date, or just the
 * prefix in Short format) — it already uniquely encodes document type +
 * tenant + format + (for Full format) calendar day, so no separate
 * table/column bookkeeping is needed here.
 *
 * No backfill in this migration on purpose: nextNumber() seeds each
 * (Tenant_ID, Sequence_Key) row itself, lazily, the first time it's ever
 * asked for that exact key — from that table's own current real max, the
 * same lookup this used to do on every call — so numbering always
 * continues from wherever it already was instead of restarting at 1.
 * Trying to enumerate and backfill every (table, column, prefix) combo
 * that has ever called nextNumber() here, by hand, in a migration, would
 * be strictly more likely to get one wrong than letting each generator
 * seed its own row on first real use.
 */
exports.up = async function (knex) {
  await knex.schema.createTable('tbl_document_number_counter', (t) => {
    t.string('Tenant_ID', 20).notNullable().references('Tenant_ID').inTable('tbl_tenant_master').onDelete('CASCADE');
    t.string('Sequence_Key', 100).notNullable();
    t.integer('Last_Seq').notNullable().defaultTo(0);
    t.primary(['Tenant_ID', 'Sequence_Key']);
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('tbl_document_number_counter');
};
