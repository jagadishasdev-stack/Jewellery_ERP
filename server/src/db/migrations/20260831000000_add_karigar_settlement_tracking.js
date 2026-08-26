/**
 * POST /api/karigar/settle used to only move the karigar's own running
 * balance from a client-supplied amount, with no record of WHICH issues
 * were paid for — clicking "Mark as Paid" twice double-paid, and
 * re-settling the same date range next month re-settled the same wages.
 * Is_Settled/Settled_Date let /settle mark exactly which issues it just
 * paid for, computed server-side (not trusted from the client), and
 * exclude them from ever being settled again.
 */
exports.up = async function (knex) {
  await knex.schema.alterTable('tbl_issue_to_karigar', (t) => {
    t.boolean('Is_Settled').notNullable().defaultTo(false);
    t.timestamp('Settled_Date', { useTz: true }).nullable();
  });
};

exports.down = async function (knex) {
  await knex.schema.alterTable('tbl_issue_to_karigar', (t) => {
    t.dropColumn('Is_Settled');
    t.dropColumn('Settled_Date');
  });
};
