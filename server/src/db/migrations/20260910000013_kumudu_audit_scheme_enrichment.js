/**
 * Kumudu Schema Audit — the safe, confirmed gaps from that comparison
 * (published as an Artifact) that are genuinely missing and don't carry
 * a business/regulatory decision: silver as a distinct tracked balance,
 * flexible installment ranges, a fixed monthly due-day, duplicate-card
 * tracking, a per-member default collection mode, GPS + e-signature
 * capture on a field-collected installment, and an explicit Agent_Type
 * on the agent table two different features already share.
 *
 * Deliberately NOT included (see the audit): an Interest flag on
 * schemes/groups — a scheme that pays interest is a different regulated
 * product from a gold-purchase-advance scheme in India, and that's a
 * business decision, not a schema gap to default into.
 */
exports.up = async function up(knex) {
  await knex.schema.alterTable('tbl_scheme_groups', (t) => {
    t.decimal('Silver_Balance_Grams', 10, 3).defaultTo(0);
    t.decimal('Min_Installment_Amount', 12, 2);
    t.decimal('Max_Installment_Amount', 12, 2);
    t.boolean('Is_Flexible_Installment').defaultTo(false);
    t.integer('Payment_Due_Day'); // 1-31, checked below
  });
  await knex.raw(`ALTER TABLE "tbl_scheme_groups" ADD CONSTRAINT "chk_scheme_groups_due_day" CHECK ("Payment_Due_Day" IS NULL OR ("Payment_Due_Day" BETWEEN 1 AND 31))`);

  await knex.schema.alterTable('tbl_scheme_members', (t) => {
    t.decimal('Silver_Balance_Grams', 10, 3).defaultTo(0);
    t.boolean('Duplicate_Card_Issued').defaultTo(false);
    t.timestamp('Duplicate_Card_Date');
    t.string('Default_Collection_Mode', 10).defaultTo('Self'); // Self | Agent
  });

  await knex.schema.alterTable('tbl_scheme_transactions', (t) => {
    // Text, not a file path — a base64 data URI or an already-uploaded
    // asset URL, caller's choice; matches how other signature/photo
    // fields already work elsewhere in this codebase (URL columns).
    t.text('Signature_Data');
    t.decimal('Latitude', 10, 7);
    t.decimal('Longitude', 10, 7);
  });

  await knex.schema.alterTable('tbl_agent_master', (t) => {
    // tbl_agent_master is shared, unlabeled, by two unrelated features
    // (savingsScheme.js's field collection agents and
    // rateBookingAgent.js's rate-lock commission agents) — this is the
    // audit's own flagged overlap. Nullable/defaulted so every existing
    // row (all of which are Collection agents today, per savingsScheme.js
    // being the only route that created them before rateBookingAgent.js
    // existed) stays correctly labeled without a data migration.
    t.string('Agent_Type', 20).defaultTo('Collection'); // Collection | Rate_Booking
    t.string('Device_ID', 255);
  });
};

exports.down = async function down(knex) {
  await knex.raw(`ALTER TABLE "tbl_scheme_groups" DROP CONSTRAINT IF EXISTS "chk_scheme_groups_due_day"`);
  await knex.schema.alterTable('tbl_scheme_groups', (t) => {
    t.dropColumn('Silver_Balance_Grams');
    t.dropColumn('Min_Installment_Amount');
    t.dropColumn('Max_Installment_Amount');
    t.dropColumn('Is_Flexible_Installment');
    t.dropColumn('Payment_Due_Day');
  });
  await knex.schema.alterTable('tbl_scheme_members', (t) => {
    t.dropColumn('Silver_Balance_Grams');
    t.dropColumn('Duplicate_Card_Issued');
    t.dropColumn('Duplicate_Card_Date');
    t.dropColumn('Default_Collection_Mode');
  });
  await knex.schema.alterTable('tbl_scheme_transactions', (t) => {
    t.dropColumn('Signature_Data');
    t.dropColumn('Latitude');
    t.dropColumn('Longitude');
  });
  await knex.schema.alterTable('tbl_agent_master', (t) => {
    t.dropColumn('Agent_Type');
    t.dropColumn('Device_ID');
  });
};
