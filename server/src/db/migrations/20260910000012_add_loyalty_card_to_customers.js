/**
 * Loyalty Card — confirmed genuinely missing by the Master/Reports/
 * Utility audit: only a points-earning/redemption engine existed
 * (tbl_loyalty_transactions, tbl_customer_master.Loyalty_Points, the
 * loyalty-slabs math in compliance.js) — no card identifier, no member
 * registry, no day sheet. Scoped conservatively: a card number is an
 * identifier tied to the EXISTING points system, not a new tier/benefit
 * engine — inventing discount tiers or card-specific benefits here would
 * be guessing at a business rule with no basis in the app today.
 *
 * A plain compound unique (not a partial index) is correct here, unlike
 * the Packet Stock/Metal Rate NULL-distinctness bugs found earlier this
 * project — there, multiple NULLs needed to be treated as ONE "no active
 * row" state and Postgres's default per-NULL-is-distinct behavior was the
 * bug. Here it's the opposite: most customers will have no card (NULL),
 * and we WANT every one of those NULLs to be independently fine — which
 * is exactly what a plain unique constraint already does by default.
 */
exports.up = async function up(knex) {
  await knex.schema.alterTable('tbl_customer_master', (t) => {
    t.string('Loyalty_Card_Number', 30);
    t.timestamp('Loyalty_Card_Issue_Date');
    t.unique(['Tenant_ID', 'Loyalty_Card_Number']);
  });
};

exports.down = async function down(knex) {
  await knex.schema.alterTable('tbl_customer_master', (t) => {
    t.dropColumn('Loyalty_Card_Number');
    t.dropColumn('Loyalty_Card_Issue_Date');
  });
};
